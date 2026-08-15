require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

const APIKEY = process.env.BINANCE_API_KEY?.trim() || '';
const APISEC = process.env.BINANCE_API_SECRET?.trim() || '';
const BASE = process.env.BINANCE_BASE_URL?.trim() || 'https://api.binance.com';
const TRON_HOT = process.env.TRON_WALLET_ADDRESS?.trim() || '';
const TRON_NODE = process.env.TRON_FULL_NODE || 'https://api.trongrid.io';
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const qs = p => new URLSearchParams(p).toString();
const sign = (p, sec) => {
  const q = qs(p);
  return q + '&signature=' + crypto.createHmac('sha256', sec).update(q).digest('hex');
};
const isPlaceholder = k => /your_|xxx|sample|^\s*$/i.test(k || '');

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║      UNIFIED REAL CRYPTO BALANCE AUDIT — ALL LOCATIONS          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  let section = 0;

  // 1. TRON HOT WALLET (ON-CHAIN)
  section++;
  console.log(`── ${section}. TRON HOT WALLET — ON-CHAIN (${TRON_HOT || 'NOT SET'}) ──\n`);
  let trxBal = 0, usdtBal = 0;
  if (TRON_HOT) {
    try {
      const acc = await axios.post(`${TRON_NODE}/wallet/getaccount`, { address: TRON_HOT, visible: true }, { timeout: 15000 });
      trxBal = Number(acc.data?.balance ?? 0) / 1e6;
      console.log(`  TRX (native gas)  : ${trxBal.toLocaleString(undefined, { maximumFractionDigits: 6 })} TRX   ≈ $${(trxBal * 0.12).toFixed(2)}`);
    } catch (e) { console.log('  TRX balance read error:', String(e.message || e).slice(0, 120)); }

    try {
      const vr = await axios.post(`${TRON_NODE}/wallet/validateaddress`, { address: TRON_HOT }, { timeout: 10000 });
      const param = vr.data.message ? Buffer.from(vr.data.message, 'base64').toString('hex').slice(2).padStart(64, '0') : null;
      if (param) {
        const br = await axios.post(`${TRON_NODE}/wallet/triggerconstantcontract`, {
          owner_address: TRON_HOT, contract_address: USDT_CONTRACT,
          function_selector: 'balanceOf(address)', parameter: param, visible: true
        }, { timeout: 15000 });
        if (br.data?.constant_result?.[0]) {
          usdtBal = Number(BigInt('0x' + br.data.constant_result[0])) / 1e6;
        }
      }
    } catch {}
    console.log(`  USDT (TRC-20)     : $${usdtBal.toLocaleString(undefined,{maximumFractionDigits:6})} USDT\n`);

    console.log(`  Status summary    :`);
    const tshort = trxBal, ushort = usdtBal;
    console.log(`   • Gas: ${tshort >= 20 ? '✅ ≥20 TRX — OKAY' : tshort >= 10 ? '⚠ LOW — ' + tshort.toFixed(2) + ' / 20 TRX' : '🔴 CRIT — ' + tshort.toFixed(2) + ' TRX'}`);
    console.log(`   • USDT: ${ushort >= 100 ? '✅ $'+ushort.toFixed(2)+' — GOOD LIQUIDITY' : ushort >= 5 ? '⚠ Low — $'+ushort.toFixed(2)+' USDT (near minWithdraw)' : ushort > 0 ? '🟡 Tiny — $'+ushort.toFixed(2)+' USDT' : '❌ $0.00 — USDT deposit pending or not funded'}`);
  }
  console.log('');

  // 2. BINANCE SPOT WALLET
  section++;
  console.log(`── ${section}. BINANCE SPOT WALLET (Binance.com — Keys in .env) ──\n`);

  if (!APIKEY || !APISEC || isPlaceholder(APIKEY) || isPlaceholder(APISEC)) {
    console.log('  ⚠ Binance API keys not set or placeholders — skipping Binance Spot read.\n');
  } else {
    const coinPriceCache = {};
    try {
      const tRes = await axios.get(`${BASE}/api/v3/ticker/price`, { timeout: 10000 });
      (tRes.data || []).forEach(r => { coinPriceCache[r.symbol] = parseFloat(r.price || 0); });
    } catch {}
    const getPrice = sym => {
      if (sym === 'USDT') return 1;
      return coinPriceCache[sym + 'USDT'] || coinPriceCache[sym + 'BUSD'] || 0;
    };

    try {
      const ts = Date.now();
      const signed = sign({ timestamp: ts, recvWindow: 10000 }, APISEC);
      const r = await axios.get(`${BASE}/api/v3/account?${signed}`, {
        headers: { 'X-MBX-APIKEY': APIKEY }, timeout: 15000,
      });

      const balances = (r.data.balances || []).map(b => ({
        asset: b.asset,
        free: parseFloat(b.free || 0),
        locked: parseFloat(b.locked || 0),
        total: parseFloat(b.free || 0) + parseFloat(b.locked || 0),
      })).filter(b => b.total > 1e-12);

      let totalUsd = 0;
      console.log('  ASSET'.padEnd(10), 'FREE'.padStart(22), 'LOCKED'.padStart(16), 'TOTAL'.padStart(22), '≈ USD VALUE'.padStart(16));
      console.log('  ' + '─'.repeat(86));
      balances.sort((a, b) => {
        const pa = a.total * getPrice(a.asset);
        const pb = b.total * getPrice(b.asset);
        return pb - pa;
      }).forEach(b => {
        const price = getPrice(b.asset);
        const usd = b.total * price;
        totalUsd += usd;
        if (usd < 0.01) return; // skip dust
        const priceStr = price ? `@$${price < 1 ? price.toFixed(4) : price.toLocaleString()}` : '';
        console.log(
          ('  ' + b.asset).padEnd(10),
          b.free.toLocaleString(undefined, { maximumFractionDigits: 6 }).padStart(22),
          b.locked.toLocaleString(undefined, { maximumFractionDigits: 6 }).padStart(16),
          b.total.toLocaleString(undefined, { maximumFractionDigits: 6 }).padStart(22),
          (priceStr ? '$' + usd.toLocaleString(undefined, { maximumFractionDigits: 2 }).padStart(14) : '?').padStart(16)
        );
      });
      console.log('  ' + '─'.repeat(86));
      console.log('  ' + 'TOTAL BINANCE SPOT AUM ≈'.padEnd(58), '$' + totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 }).padStart(14));
      console.log('');

      const hasUsdt5 = (balances.find(b => b.asset === 'USDT')?.total || 0) >= 5;
      console.log(`  Readiness (Binance withdrawal path — Tier 2 for non-TRC20 assets):`);
      console.log(`   • Spot USDT >= 5 USDT (minWithdraw USDT-TRC20): ${hasUsdt5 ? '✅ YES' : '❌ NO — have $'+((balances.find(b=>b.asset==='USDT')?.total||0).toFixed(2))+', need $5.00 minimum before Binance will process USDT withdrawal'}`);
    } catch (e) {
      console.log('  ❌ Binance /api/v3/account error:', (e.response?.status || '') + ' ' + (e.response?.data?.msg || e.response?.data?.message || e.message || '').toString().slice(0,300));
      if (e.response?.data?.code === -2015) console.log('     (Code -2015 means API key is invalid/IP not whitelisted)');
    }
  }

  // 3. SUMMARY
  console.log('\n═══ GRAND TOTAL — ALL REAL CRYPTO IN YOUR CONTROL ═══\n');
  const hotUsdUsdt = usdtBal * 1;
  const hotUsdTrx = trxBal * 0.12;
  console.log(`  On-chain TRON hot wallet: $${(hotUsdUsdt + hotUsdTrx).toFixed(2)}  (${usdtBal.toFixed(2)} USDT + ${trxBal.toFixed(2)} TRX)`);
  console.log(`  Note: AUM of Binance above is only what Binance shows you; it is NOT your on-chain holdings.`);
})().catch(e => {
  console.error('\nFATAL:', e.message || e);
  if (e.response) console.error('  HTTP', e.response.status, JSON.stringify(e.response.data || {}).slice(0, 500));
  process.exit(1);
});
