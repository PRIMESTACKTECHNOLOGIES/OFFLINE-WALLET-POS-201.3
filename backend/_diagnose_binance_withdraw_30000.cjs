require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

const cfg = {
  apiKey: process.env.BINANCE_API_KEY?.trim() || '',
  apiSecret: process.env.BINANCE_API_SECRET?.trim() || '',
  baseUrl: process.env.BINANCE_BASE_URL?.trim() || 'https://api.binance.com',
};
const H = { 'X-MBX-APIKEY': cfg.apiKey };

// Exactly match the CORRECTED signing pattern we now use in binance.service.ts:
// For POST /sapi/* endpoints, signature goes on the QUERY STRING (Python sample pattern).
// Query-string fields = same fields as x-www-form-urlencoded POST body. HMAC covers the
// concatenated query-string WITHOUT signature, then ?query+&signature=XYZ is appended
// to the URL, and the same x-www-form-urlencoded payload is sent in the POST body.
function signedPOST(path, fields) {
  const body = new URLSearchParams();
  const entries = Object.entries({ ...fields, timestamp: Date.now() });
  for (const [k, v] of entries) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') body.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    else body.append(k, String(v));
  }
  const signature = crypto.createHmac('sha256', cfg.apiSecret).update(body.toString()).digest('hex');
  const url = `${cfg.baseUrl}${path}?${body.toString()}&signature=${signature}`;
  return { url, method: 'POST', body: body.toString() };
}
function signedGET(path, params = {}) {
  const qs = new URLSearchParams({ ...params, timestamp: Date.now() }).toString();
  const sig = crypto.createHmac('sha256', cfg.apiSecret).update(qs).digest('hex');
  return `${cfg.baseUrl}${path}?${qs}&signature=${sig}`;
}

(async () => {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  BINANCE WITHDRAWAL DIAGNOSTIC — error -30000 investigation   ');
  console.log('════════════════════════════════════════════════════════════════');

  // ── 1. Account snapshot (trusted, works) ────────────────────────────────
  console.log('\n1. /api/v3/account snapshot:');
  try {
    const account = (await axios.get(signedGET('/api/v3/account'), { headers: H })).data;
    const bals = (account.balances || [])
      .map(b => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked) }))
      .filter(b => b.free + b.locked > 0);
    bals.forEach(b => console.log(`   • ${b.asset.padEnd(6)}  free=${b.free.toFixed(8)}  locked=${b.locked.toFixed(8)}`));
    console.log(`   canWithdraw = ${account.canWithdraw}   accountType=${account.accountType}`);
  } catch (e) {
    console.log('   ❌', e.response?.status, JSON.stringify(e.response?.data));
  }

  // ── 2. All coins' network list for USDT and TRX ─────────────────────────
  console.log('\n2. /sapi/v1/capital/config/getall — withdraw/deposit config for USDT, TRX:');
  try {
    const coinCfg = (await axios.get(signedGET('/sapi/v1/capital/config/getall'), { headers: H })).data;
    for (const needle of ['USDT', 'TRX']) {
      const c = coinCfg.find(x => x.coin === needle);
      if (!c) { console.log(`   ${needle}: not in coin list`); continue; }
      console.log(`\n   🪙 ${needle}:`);
      console.log(`      isLegalMoney  = ${c.isLegalMoney}`);
      console.log(`      locked       = ${c.locked}  (freeze=0 means withdrawable)`);
      console.log(`      withdrawing  = ${Number(c.withdrawing ?? 0).toFixed(8)}  (pending now)`);
      for (const n of c.networkList || []) {
        const net = n.network;
        console.log(`      ┌ net=${net.padEnd(10)}  name=${n.name}  isDefault=${n.isDefault}  depositEnable=${n.depositEnable}  withdrawEnable=${n.withdrawEnable}  addressRegex=${String(n.addressRegex ?? '').slice(0, 50)}`);
        console.log(`      │ withdrawFee=${n.withdrawFee?.padEnd?.(12) ?? String(n.withdrawFee)}  minWithdraw=${n.withdrawMin ?? '?'}  maxWithdraw=${n.withdrawMax ?? '?'}`);
        console.log(`      │ busy=${n.busy}  contract=${String(n.contractAddress ?? '').slice(0, 30)}  specialty=${n.specialty ?? ''}`);
      }
    }
  } catch (e) {
    console.log('   ❌', e.response?.status, JSON.stringify(e.response?.data));
  }

  // ── 3. Recent withdrawal history ────────────────────────────────────────
  console.log('\n3. /sapi/v1/capital/withdraw/history — last 5 withdrawals:');
  try {
    const hist = (await axios.get(signedGET('/sapi/v1/capital/withdraw/history', { limit: 5 }), { headers: H })).data;
    if (!hist.length) console.log('   (empty — no withdrawals on this key ever)');
    for (const w of hist.slice(-5)) {
      console.log(`   • id=${w.id}  ${w.amount} ${w.coin}  net=${w.network}  to=${String(w.address).slice(0,10)}…  status=${w.status}  txId=${String(w.txId ?? '').slice(0,18)}  applyTime=${w.applyTime}`);
      if (w.info || w.transactionFee) console.log(`     fee=${w.transactionFee} info=${w.info ?? ''}`);
    }
  } catch (e) {
    console.log('   ❌', e.response?.status, JSON.stringify(e.response?.data));
  }

  // ── 4. Deposit address for USDT-TRC20 and TRX on this account ───────────
  console.log('\n4. /sapi/v1/capital/deposit/address — Binance deposit addresses (shows Binance-owned addresses you can compare with our destination):');
  for (const { coin, network } of [{ coin: 'USDT', network: 'TRC20' }, { coin: 'TRX', network: 'TRC20' }]) {
    try {
      const r = (await axios.get(signedGET('/sapi/v1/capital/deposit/address', { coin, network }), { headers: H })).data;
      console.log(`   ${coin}-${network}: address=${r.address}${r.tag ? `  tag=${r.tag}` : ''}`);
      if (r.address === 'TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP') {
        console.log('     ⚠️  DESTINATION == BINANCE OWN DEPOSIT ADDRESS. This can trigger -30000 or');
        console.log('     "internal transfer" semantics. Withdrawals from Binance TO the Binance hot wallet');
        console.log('     itself are a loop. Use a different withdrawal address (e.g. the merchant\'s personal TronLink).');
      }
    } catch (e) { console.log(`   ${coin}-${network}: ❌ ${e.response?.status} ${JSON.stringify(e.response?.data)}`); }
  }

  // ── 5. Withdraw status on that specific address (by id) — not applicable without a withdraw ID
  //    Instead: do one more probe without network param (let Binance auto-select network).
  console.log('\n5. Extra probe: withdrawAsset 0.10 USDT without explicit network field (auto-select):');
  try {
    const p = signedPOST('/sapi/v1/localentity/withdraw/apply', {
      coin: 'USDT',
      address: 'TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP',
      amount: '0.10',
      questionnaire: JSON.stringify({ isAddressOwner: '1', sendTo: '1' }),
      withdrawOrderId: 'PROBE-NO-NET-' + Date.now(),
      recvWindow: 60000,
    });
    const r = await axios.post(p.url, p.body, { headers: { ...H, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000, validateStatus: () => true });
    console.log(`   HTTP ${r.status} code=${r.data?.code}  msg=${r.data?.msg}`);
    console.log('   Full body:', JSON.stringify(r.data));
    if (r.data.code === -30000) {
      console.log('\n   📌 -30000 INTERPRETATION GUIDANCE:');
      console.log('      Known Binance triggers for -30000 "System failure" on withdrawal:');
      console.log('      1. Destination address NOT in Binance whitelist (Security → API Key → Withdrawal Address Whitelist).');
      console.log('      2. 2-factor auth not enabled or not passed for this API key withdrawal.');
      console.log('      3. Address is Binance-owned (self-withdrawal). Try an external personal wallet (TronLink/Trust/Metamask).');
      console.log('      4. Balance insufficient on SPECIFIC NETWORK (Spot free != same-as-network withdrawal balance).');
      console.log('      5. Withdrawal below minWithdraw. Check minWithdraw for USDT-TRC20 in section 2 above.');
      console.log('      6. Travel Rule questionnaire missing required fields for this jurisdiction (try sendTo=0+bnfType+bnfName+country+city).');
    }
  } catch (e) {
    console.log('   ❌', e.message, e.response?.status, JSON.stringify(e.response?.data));
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  process.exit(0);
})().catch(e => {
  console.error('\n💥 UNHANDLED:', e.message);
  if (e.response) console.error('   HTTP', e.response.status, JSON.stringify(e.response.data).slice(0, 800));
  process.exit(1);
});
