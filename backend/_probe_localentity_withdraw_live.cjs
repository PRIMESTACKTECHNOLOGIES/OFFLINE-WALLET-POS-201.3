require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

const cfg = {
  apiKey: process.env.BINANCE_API_KEY?.trim() || '',
  apiSecret: process.env.BINANCE_API_SECRET?.trim() || '',
  baseUrl: process.env.BINANCE_BASE_URL?.trim() || 'https://api.binance.com',
};

const INDIA_QUESTIONNAIRE = { isAddressOwner: '1', sendTo: '1' };

const ENDPOINT_PATH = '/sapi/v1/localentity/withdraw/apply';

function signBody(bodyParams) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries({
    ...bodyParams,
    timestamp: bodyParams.timestamp || Date.now(),
    recvWindow: bodyParams.recvWindow || 60000,
  })) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') body.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    else body.append(k, String(v));
  }
  const signature = crypto.createHmac('sha256', cfg.apiSecret).update(body.toString()).digest('hex');
  body.append('signature', signature);
  return { body, signature };
}

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  BINANCE LIVE WITHDRAWAL PROBE — /sapi/v1/localentity/withdraw/apply');
  console.log('  INDIA Travel Rule Questionnaire {isAddressOwner:1, sendTo:1}');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  ℹ️  This script executes the EXACT SAME request flow as the');
  console.log('      Python sample you shared — signed POST x-www-form-urlencoded,');
  console.log('      questionnaire as compact JSON string, HMAC-SHA256 covers all');
  console.log('      fields including questionnaire.');
  console.log('');
  console.log('  ⚠️  REAL MONEY MOVEMENT — uses DUST amount (see below) to a test address.');
  console.log('      If this probe succeeds with code 0 / accepted=true, the -4104 is gone.');
  console.log('');

  // ── Step 0: Gather account state (balances, withdrawal address config) ──
  try {
    const infoSigned = signQuery({ recvWindow: 60000 });
    const account = (await axios.get(`${cfg.baseUrl}/api/v3/account?${infoSigned}`, {
      headers: { 'X-MBX-APIKEY': cfg.apiKey }, timeout: 15000,
    })).data;
    const bals = (account.balances || [])
      .map(b => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked) }))
      .filter(b => b.free + b.locked > 0);
    console.log('📊 LIVE Binance Spot balances (non-zero):');
    bals.forEach(b => console.log(`   • ${b.asset.padEnd(7)} free=${b.free.toFixed(8).padStart(20)}  locked=${b.locked.toFixed(8).padStart(20)}`));
    console.log(`   Withdrawal permission: ${account.canWithdraw ? '✅ YES' : '❌ NO — enable Withdrawal on Binance API Key page first!'}`);
    console.log('');
    if (!account.canWithdraw) process.exit(1);
  } catch (e) {
    console.log('❌ Cannot read account info:', e.message, e.response?.data);
    process.exit(1);
  }

  // ── Step 1: Figure out WHICH asset/network we can dust-withdraw ──────────
  //    Strategy: prefer 0.10 USDT on BSC (cheapest). Fallback: 0.10 USDT on TRC20.
  //    Fallback 2: any TRX (>1). Fallback 3: abort.
  //    Destination address: for USDT-BSC dust we need a BSC test address.
  //    The user's TRON T-address is known (TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP); we
  //    use that for any TRC-20 network attempt.
  const DEST_TRON = 'TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP';
  // For the BSC dust: use the same Binance account's own BSC BEP20 USDT deposit address? No —
  // can't programmatically look up. We use a KNOWN test address chosen to be likely
  // whitelisted. User can change this in DUST_WITHDRAW = { ... } below.
  const DUST_WITHDRAW = [
    { coin: 'USDT', network: 'BSC',    amount: '0.10', address: DEST_TRON /* will likely fail because T… not BSC, that's OK we capture the error */ },
    { coin: 'USDT', network: 'TRC20',  amount: '0.10', address: DEST_TRON },
    { coin: 'TRX',  network: 'TRC20',  amount: '2.00', address: DEST_TRON },
  ];

  console.log('🧪 PROBE SCHEDULE (proceeds in order until one returns code=0 or non-network error):');
  DUST_WITHDRAW.forEach((p, i) => console.log(`   ${i + 1}. ${p.amount} ${p.coin}  net=${p.network}  → ${p.address.slice(0, 10)}…${p.address.slice(-6)}`));
  console.log('');

  let attempt = 0;
  for (const probe of DUST_WITHDRAW) {
    attempt++;
    console.log(`────────── Attempt ${attempt}: ${probe.amount} ${probe.coin} ${probe.network} → ${probe.address} ──────────`);

    const questionnaire = typeof INDIA_QUESTIONNAIRE === 'string'
      ? INDIA_QUESTIONNAIRE
      : JSON.stringify(INDIA_QUESTIONNAIRE);

    const requestFields = {
      coin: probe.coin,
      network: probe.network,
      address: probe.address,
      amount: probe.amount,
      questionnaire,
      recvWindow: 60000,
    };

    const t1 = Date.now();
    requestFields.timestamp = t1;

    const { body, signature } = signBody(requestFields);
    const bodyStr = body.toString();

    // ── Rebuild FULL URL for debug display (exact format of Python sample) ──
    const querystringFromBody = bodyStr;   // already has all fields + signature
    const fullUrlForDisplay = cfg.baseUrl + ENDPOINT_PATH + '?' + querystringFromBody;

    console.log('');
    console.log('📝 FULL REQUEST URL (signature included — exactly like Python sample print(url)):');
    console.log('   ' + fullUrlForDisplay);
    console.log('');
    console.log('🔑 HMAC Input (signed body — confirm HMAC covers questionnaire):');
    const withoutSig = bodyStr.slice(0, bodyStr.lastIndexOf('&signature='));
    console.log('   ' + withoutSig);
    console.log(`   signature(${signature.slice(0, 16)}…${signature.slice(-8)})`);
    console.log('');
    console.log(`📨 POST ${cfg.baseUrl}${ENDPOINT_PATH}`);
    console.log(`   Content-Type: application/x-www-form-urlencoded`);
    console.log(`   X-MBX-APIKEY: ${cfg.apiKey.slice(0, 8)}…${cfg.apiKey.slice(-6)}`);
    console.log(`   Body length : ${bodyStr.length} bytes`);
    console.log('');

    let res;
    try {
      res = await axios.post(cfg.baseUrl + ENDPOINT_PATH, bodyStr, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-MBX-APIKEY': cfg.apiKey,
        },
        timeout: 30000,
        validateStatus: () => true,   // capture all HTTP codes, never throw
      });
    } catch (e) {
      console.log(`   ❌ NETWORK ERROR: ${e.message}`);
      continue;
    }

    console.log(`📡 RESPONSE — HTTP ${res.status}  (${Date.now() - t1}ms)`);
    console.log(`   STATUS CODE: ${res.status}`);
    console.log(`   FULL BODY  : ${JSON.stringify(res.data)}`);
    const code = res.data?.code;
    const msg  = res.data?.msg;

    if (String(code) === '0' || (!code && res.status < 300 && (res.data?.id || res.data?.trId))) {
      console.log('');
      console.log('✅✅✅ WITHDRAWAL ACCEPTED — Travel Rule RESOLVED! ✅✅✅');
      console.log(`   id      : ${res.data.id}`);
      console.log(`   trId    : ${res.data.trId ?? '(none returned)'}`);
      console.log(`   accepted: ${res.data.accepted}`);
      console.log(`   info    : ${res.data.info ?? '(none)'}`);
      console.log('');
      console.log('  INDIA Travel Rule questionnaire + /localentity/withdraw/apply endpoint');
      console.log('  works on this API key. The -4104 is permanently bypassed for India.');
      process.exit(0);
    }

    // Failure classification
    console.log('');
    console.log('🩺 DIAGNOSIS:');
    if (code === -4104 || /travel.?rule/i.test(msg || '')) {
      console.log('   ❌ STILL -4104 Travel Rule. INDIA questionnaire was submitted:');
      console.log(`      questionnaire = ${questionnaire}`);
      console.log('      This means Binance still requires a DIFFERENT questionnaire payload');
      console.log('      (e.g. 3rd-party fields sendTo=0 + bnfType/bnfName/country/city) or this');
      console.log('      key entity is NOT under India jurisdiction. Check the ENTITLEMENT diagnostic');
      console.log('      output from _diagnose_travel_rule.cjs and compare questionnaireCountryCode.');
    } else if (code === -2010 || /insufficient/i.test(msg || '')) {
      console.log('   ℹ️  Insufficient balance for ' + probe.coin + ' — skip to next probe.');
    } else if (code === -3001 || code === -3003 || code === -3005 || /whitelist|address not allowed|not whitelisted|withdraw address/i.test(msg || '')) {
      console.log('   ℹ️  Address not whitelisted. Add the destination address to Binance withdrawal');
      console.log('      whitelist (Security → API Management → Withdrawal Addresses Whitelist).');
      console.log('      This is a SECURITY CONFIG issue, NOT a Travel Rule issue.');
    } else if (code === -3006 || /network/i.test(msg || '')) {
      console.log('   ℹ️  Invalid network / coin + network combination for this address type.');
      console.log(`      Message: ${msg}`);
    } else if (code === -2014) {
      console.log('   ❌ Signature format invalid (-2014). Check HMAC secret encoding.');
    } else if (code === -2015) {
      console.log('   ❌ API Key invalid / IP not whitelisted (-2015).');
    } else if (res.status === 403) {
      console.log('   ❌ HTTP 403 Forbidden — likely this API key does NOT have the required');
      console.log('      "Local Entity" / Travel Rule permissions on Binance side.');
    } else {
      console.log(`   ℹ️  Other Binance code=${code} msg=${msg}`);
    }
    console.log('');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  ALL PROBES COMPLETE — review the status code / body outputs above');
  console.log('  for each attempt and match against Binance codes to decide next step.');
  console.log('═══════════════════════════════════════════════════════════════════');
  process.exit(0);

  function signQuery(params) {
    const full = { timestamp: params.timestamp || Date.now(), recvWindow: params.recvWindow || 60000, ...params };
    delete full.timestamp; delete full.recvWindow;
    const final = { recvWindow: full.recvWindow || 60000, timestamp: Date.now(), ...params };
    const qs = new URLSearchParams(final).toString();
    const sig = crypto.createHmac('sha256', cfg.apiSecret).update(qs).digest('hex');
    return `${qs}&signature=${sig}`;
  }
})().catch(e => {
  console.error('\n💥 UNHANDLED:', e.message);
  if (e.response) console.error('   HTTP', e.response.status, JSON.stringify(e.response.data).slice(0, 600));
  process.exit(1);
});
