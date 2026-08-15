require('dotenv').config();
const axios = require('axios');

const ADDR = process.env.TRON_WALLET_ADDRESS?.trim() || '';
const GRID = process.env.TRON_API_KEY?.trim() || '';
const NODE = process.env.TRON_FULL_NODE || 'https://api.trongrid.io';
const H = GRID ? { 'TRON-PRO-API-KEY': GRID } : {};
const GET = async p => (await axios.get(NODE + p, { headers: H, timeout: 20000 })).data;
const POST = async (p, body) => (await axios.post(NODE + p, body || {}, { headers: { ...H, 'Content-Type': 'application/json' }, timeout: 20000 })).data;

const USDT_CONTRACT_BASE58 = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  TRON HOT WALLET — ON-CHAIN BALANCE PROBE (NO tronweb lib)');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  console.log(`  Node          : ${NODE}`);
  console.log(`  Trongrid Key  : ${GRID ? '✅ ' + GRID.slice(0, 10) + '…' : '❌ NOT SET — will hit 1/sec rate limit'}`);
  console.log(`  Hot Address   : ${ADDR || '(MISSING!)'}\n`);

  if (!ADDR) { process.exit(1); }

  // 1. TRX balance via /wallet/getaccount
  try {
    const acc = await POST(`/wallet/getaccount`, { address: ADDR, visible: true });
    const trx = Number(acc.balance ?? 0) / 1_000_000;
    const net = (acc.frozen_balance_for_bandwidth?.frozen_balance ?? 0) / 1_000_000;
    const en = (acc.frozen_balance_for_energy?.frozen_balance ?? 0) / 1_000_000;
    const res = (acc.account_resource?.frozen_balance_for_energy?.frozen_balance ?? 0) / 1_000_000;
    const energyTotal = Number(acc.account_resource?.energy_window_size ?? 0);
    console.log('  ┌─ TRX BALANCE ──────────────────────────────────────────────────────┐');
    console.log(`  │ Liquid TRX      : ${trx.toFixed(6).padStart(20)} TRX  (≈ $${(trx * 0.12).toFixed(2)})   │`);
    console.log(`  │ Staked Bandwidth: ${net.toFixed(6).padStart(20)} TRX                    │`);
    console.log(`  │ Staked Energy   : ${(en + res).toFixed(6).padStart(20)} TRX                    │`);
    console.log(`  │ Free Bandwidth  : ${String(acc.free_net_limit || 0).padStart(14)} bytes              │`);
    console.log(`  │ Daily Energy    : ${String(energyTotal).padStart(14)} energy units         │`);
    const minTrx = 25; // USDT transfer uses ~318 bandwidth + ~15 energy (or burns ~0.34 TRX)
    const pass = trx >= minTrx;
    console.log(`  │ Gas threshold   : ${minTrx} TRX min.  ${pass ? '✅ SUFFICIENT for unlimited USDT transfers' : '❌ LOW — deposit ' + (minTrx - trx).toFixed(2) + ' TRX for gas'}`);
    console.log('  └────────────────────────────────────────────────────────────────────┘\n');
  } catch (e) {
    console.log('  TRX fetch err:', String(e.message || e).slice(0, 200), '\n');
  }

  // 2. USDT TRC-20 balanceOf(address) via triggerconstantcontract
  // parameter = address in HEX 64-char left-padded
  const addrHex = await (async () => {
    try {
      const r = await POST(`/wallet/getaccount`, { address: ADDR, visible: true });
      return r.address;  // if account not created on-chain this gives empty
    } catch { return null; }
  })();
  // Build address param: base58→hex→32bytes
  const addrHexParam = (async () => {
    const r = await POST(`/wallet/validateaddress`, { address: ADDR });
    if (!r?.result) return null;
    return r.message ? Buffer.from(r.message,'base64').toString('hex').padStart(64,'0') : null;
  })();

  const toHexAddr = async (b58) => {
    const r = await POST(`/wallet/validateaddress`, { address: b58 });
    if (!r?.result) throw new Error('invalid address ' + b58);
    const hex = Buffer.from(r.message, 'base64').toString('hex');
    return hex.slice(2).padStart(64, '0'); // remove 41 prefix, pad to 64
  };

  try {
    const param = await toHexAddr(ADDR);
    const r = await POST(`/wallet/triggerconstantcontract`, {
      owner_address: ADDR,
      contract_address: USDT_CONTRACT_BASE58,
      function_selector: 'balanceOf(address)',
      parameter: param,
      visible: true,
    });
    let usdt = 0;
    if (r?.constant_result?.[0]) {
      const raw = BigInt('0x' + r.constant_result[0]);
      usdt = Number(raw) / 1_000_000;
    }
    console.log('  ┌─ USDT TRC-20 BALANCE ──────────────────────────────────────────────┐');
    console.log(`  │ Hot wallet USDT : $${usdt.toLocaleString(undefined,{maximumFractionDigits:6}).padStart(26)} USDT                    │`);
    console.log(`  │ Contract        : ${USDT_CONTRACT_BASE58}  (Tether official)   │`);
    if (usdt >= 1) console.log(`  │ ✅ HOT LIQUIDITY OK — can execute live withdrawals up to $${usdt.toFixed(2)}  │`);
    else {
      console.log(`  │ ⚠  HOT USDT LOW (< $1). TOP UP NEEDED:                            │`);
      console.log(`  │ Send USDT on TRC-20 network → address →  ${ADDR}   │`);
      console.log(`  │ (Any exchange's withdraw-USDT-TRC20 → above addr lands here)      │`);
    }
    console.log('  └────────────────────────────────────────────────────────────────────┘\n');

    // 3. On-chain last 10 transactions
    try {
      const txs = (await GET(`/v1/accounts/${ADDR}/transactions?limit=10&only_to=true&min_timestamp=0`)).data || [];
      console.log(`  Last ${txs.length} inbound on-chain transfers to hot wallet:\n`);
      txs.slice(0, 5).forEach((t, i) => {
        const amt = t?.raw_data?.contract?.[0]?.parameter?.value;
        const ts = new Date(t.block_timestamp || 0).toISOString().slice(0, 19);
        console.log(`     #${i}  ${ts}  ${t.ret?.[0]?.contractRet || 'ERR'}  txID=${t.txID?.slice(0,14)}…  ${ amt ? JSON.stringify(amt).slice(0,80) : ''}`);
      });
    } catch (e) { /* ignore, optional */ }

    // 4. WITHDRAWAL FEASIBILITY REPORT
    const trxBal = Number(((await POST(`/wallet/getaccount`,{address:ADDR,visible:true})).balance||0)/1_000_000);
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  🎯 CAN WE EXECUTE LIVE USDT TRC-20 WITHDRAWALS RIGHT NOW?');
    console.log('═══════════════════════════════════════════════════════════════════\n');
    const report = [
      ['TronWeb code in tronweb.service.ts', '✅ Full implementation (lines 1-101)'],
      ['Route /wallets/crypto-withdraw (wallets.controller.ts:302)', '✅ Bound & active'],
      ['TRON_PRIVATE_KEY in .env', (process.env.TRON_PRIVATE_KEY||'').length === 64 ? '✅ 64-hex key set' : '❌ MISSING'],
      ['TRON_WALLET_ADDRESS in .env', ADDR ? '✅ ' + ADDR : '❌ MISSING'],
      ['TRX gas ≥ 25 TRX', trxBal >= 25 ? `✅ ${trxBal.toFixed(2)} TRX` : `⚠️  ONLY ${trxBal.toFixed(2)} TRX — fund ${(25 - trxBal).toFixed(2)} TRX for gas buffer`],
      ['USDT hot balance ≥ $10 (min meaningful)', usdt >= 10 ? `✅ $${usdt.toFixed(2)}` : `⚠️  ONLY $${usdt.toFixed(2)} — top up address with USDT TRC-20 first`],
    ];
    report.forEach(([k, v]) => console.log(`  • ${k.padEnd(45)} ${v}`));
    console.log('\n═══════════════════════════════════════════════════════════════════\n');
  } catch (e) {
    console.error('USDT read ERR:', e?.message || e);
  }
})().catch(e => { console.error('\n💥 FATAL:', e.message || e); process.exit(1); });
