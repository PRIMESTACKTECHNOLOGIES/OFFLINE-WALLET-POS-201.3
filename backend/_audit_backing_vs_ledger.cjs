require('dotenv').config();
const path = require('path');
const { dbPathFactory } = require('./dist/config/db.js');
const { openSync, closeSync, prepareSync, execSync } = (() => {
  try { return require('better-sqlite3-sync'); } catch { return {}; }
})();
const Database = (() => { try { return require('better-sqlite3'); } catch { return null; } })();
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
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   FIDUCIARY AUDIT: CUSTOMER LIABILITIES  vs  REAL BACKING ASSETS    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  // 1. Open the local SQLite ledger
  let db = null;
  try {
    const dbFile = dbPathFactory ? path.resolve(await dbPathFactory()) : path.resolve(__dirname, '..', 'ledger.db');
    if (Database) {
      db = new Database(dbFile, { readonly: true, fileMustExist: false });
      console.log(`🗂️  Ledger DB opened (read-only): ${dbFile}\n`);
    } else {
      throw new Error('better-sqlite3 not available');
    }
  } catch (e) {
    console.log('  DB open error, falling back to guess path. Error:', e.message?.slice(0, 120) || e);
    process.exit(1);
  }

  const qry = (sql, binds = []) => db.prepare(sql).all(...binds);

  // Section A: Customer FIAT wallets
  console.log('─── A. CUSTOMER FIAT WALLET LIABILITIES (customer_wallets table) ───\n');
  try {
    const fiat = qry(`
      SELECT currency,
             COUNT(*) AS wallets,
             SUM(balance) AS total_balance,
             AVG(balance) AS avg_balance
      FROM customer_wallets
      GROUP BY currency
      ORDER BY total_balance DESC
    `);
    if (fiat.length === 0) console.log('  (no customer fiat wallets)\n');
    let totalFiatUsd = 0;
    fiat.forEach(r => {
      const usdValue = (r.currency === 'USD') ? r.total_balance :
                       (r.currency === 'AED') ? r.total_balance / 3.6725 :
                       r.total_balance * (r.currency === 'INR' ? 0.012 : 1);
      totalFiatUsd += usdValue;
      console.log(`  ${String(r.currency).padEnd(6)}  ${String(r.wallets).padStart(4)} wallets   SUM balance: ${Number(r.total_balance||0).toLocaleString(undefined,{maximumFractionDigits:2}).padStart(18)}  ≈ $${usdValue.toLocaleString(undefined,{maximumFractionDigits:2}).padStart(12)}  avg: ${Number(r.avg_balance||0).toFixed(2)}`);
    });
    console.log(`\n  → Total customer fiat liabilities (converted to USD rough): $${totalFiatUsd.toLocaleString(undefined,{maximumFractionDigits:2})}\n`);
  } catch (e) { console.log('  error:', e.message); }

  // Section B: Customer CRYPTO wallets
  console.log('─── B. CUSTOMER CRYPTO WALLET LIABILITIES (crypto_wallets table) ───\n');
  let cryptoLiab = {};
  let totalCryptoLiabUsd = 0;
  try {
    const cr = qry(`
      SELECT crypto_coin,
             COUNT(*) AS wallets,
             SUM(balance) AS total_balance,
             SUM(locked_balance) AS total_locked
      FROM crypto_wallets
      GROUP BY crypto_coin
      ORDER BY total_balance DESC
    `);
    if (cr.length === 0) console.log('  (no crypto_wallets table or rows)\n');
    // get Binance spot prices to convert crypto liability to USD
    let priceCache = { USDT: 1, USDC: 1, BUSD: 1 };
    try {
      const prices = await axios.get(`${BASE}/api/v3/ticker/price`, { timeout: 10000 });
      (prices.data || []).forEach(r => { if (r.symbol.endsWith('USDT')) priceCache[r.symbol.slice(0,-4)] = parseFloat(r.price) || 0; });
    } catch {}
    priceCache['TRX'] = priceCache['TRX'] || 0.12;
    priceCache['BTC'] = priceCache['BTC'] || 63000;
    priceCache['ETH'] = priceCache['ETH'] || 2600;
    priceCache['SOL'] = priceCache['SOL'] || 140;

    console.log('  COIN'.padEnd(8),'WALLETS'.padStart(7),'BALANCE'.padStart(24),'LOCKED'.padStart(18),'≈ USD VALUE'.padStart(16),'SPOT PRICE'.padStart(14));
    console.log('  ' + '─'.repeat(88));
    cr.forEach(r => {
      const coin = r.crypto_coin;
      const price = priceCache[coin] || 0;
      const usdVal = (Number(r.total_balance || 0) + Number(r.total_locked || 0)) * price;
      cryptoLiab[coin] = Number(r.total_balance || 0) + Number(r.total_locked || 0);
      totalCryptoLiabUsd += usdVal;
      console.log(
        ('  '+coin).padEnd(8),
        String(r.wallets).padStart(7),
        Number(r.total_balance||0).toLocaleString(undefined,{maximumFractionDigits:6}).padStart(24),
        Number(r.total_locked||0).toLocaleString(undefined,{maximumFractionDigits:6}).padStart(18),
        '$'+usdVal.toLocaleString(undefined,{maximumFractionDigits:2}).padStart(14),
        price ? ('$'+(price < 1 ? price.toFixed(4) : price.toLocaleString(undefined,{maximumFractionDigits:2}))).padStart(14) : '?'.padStart(14)
      );
    });
    console.log('  ' + '─'.repeat(88));
    console.log('  → Total customer crypto liabilities (USD approx):'.padEnd(65), '$'+totalCryptoLiabUsd.toLocaleString(undefined,{maximumFractionDigits:2}));
    console.log();
  } catch (e) { console.log('  error:', e.message); console.log(e.stack); }

  // Section C: MERCHANT WALLET BALANCES (merchant_wallets + merchant_crypto_wallets tables)
  console.log('─── C. MERCHANT INTERNAL BACKING WALLETS (SQLite "merchant_*_wallets") ───\n');
  let merchantFiat = 0, merchantCryptoUsd = 0, merchantCryptoBal = {};
  try {
    const mf = qry(`SELECT currency, SUM(balance) AS s FROM merchant_wallets GROUP BY currency`);
    mf.forEach(r => {
      const usd = (r.currency === 'USD') ? r.s : (r.currency === 'AED') ? r.s/3.6725 : r.s;
      merchantFiat += usd;
      console.log(`  Merchant FIAT [${r.currency}]  SUM: ${Number(r.s||0).toLocaleString(undefined,{maximumFractionDigits:2}).padStart(16)}  ≈ $${usd.toLocaleString(undefined,{maximumFractionDigits:2})}`);
    });
  } catch (e) { console.log('  merchant_wallets error:', e.message); }
  try {
    const mc = qry(`SELECT crypto_coin AS coin, SUM(balance) AS s, SUM(locked_balance) AS l FROM merchant_crypto_wallets GROUP BY crypto_coin`);
    let priceCache2 = { USDT:1 };
    try { const pp = await axios.get(`${BASE}/api/v3/ticker/price`, { timeout: 8000 }); (pp.data||[]).forEach(r => { if (r.symbol.endsWith('USDT')) priceCache2[r.symbol.slice(0,-4)] = parseFloat(r.price) || 0; }); } catch {}
    mc.forEach(r => {
      const bal = Number(r.s||0)+Number(r.l||0);
      merchantCryptoBal[r.coin] = bal;
      const price = priceCache2[r.coin] || 0;
      const usd = bal * price;
      merchantCryptoUsd += usd;
      console.log(`  Merchant CRYPTO [${r.coin.padEnd(6)}] SUM: ${bal.toLocaleString(undefined,{maximumFractionDigits:6}).padStart(20)} ≈ $${usd.toLocaleString(undefined,{maximumFractionDigits:2}).padStart(12)}`);
    });
  } catch (e) { console.log('  merchant_crypto_wallets error:', e.message); }
  console.log(`\n  → Merchant in-SQLite fiat backing:    $${merchantFiat.toLocaleString(undefined,{maximumFractionDigits:2})}`);
  console.log(`  → Merchant in-SQLite crypto backing:  $${merchantCryptoUsd.toLocaleString(undefined,{maximumFractionDigits:2})}`);
  console.log('  (Note: Merchant "wallets" are your own internal SQL accounts. They are NOT real on-chain or exchange balances. They only reflect what your own ledger thinks the merchant has. The REAL backing lives outside the DB on Tron chain + Binance.)\n');

  // Section D: REAL BACKING — On-chain TRON + Binance Spot
  console.log('─── D. REAL BACKING ASSETS (LIVE — On-chain TRON & Binance Spot) ───\n');
  let realBack = { TRX: 0, USDT: 0 };
  let realBinance = {};
  let totalBackUsd = 0;
  // TRON
  if (TRON_HOT) {
    try {
      const acc = await axios.post(`${TRON_NODE}/wallet/getaccount`, { address: TRON_HOT, visible: true }, { timeout: 15000 });
      realBack.TRX = Number(acc.data?.balance ?? 0) / 1e6;
    } catch (e) { console.log('  Tron TRX read err:', String(e.message||e).slice(0,80)); }
    try {
      const vr = await axios.post(`${TRON_NODE}/wallet/validateaddress`, { address: TRON_HOT }, { timeout: 10000 });
      const param = vr.data.message ? Buffer.from(vr.data.message, 'base64').toString('hex').slice(2).padStart(64,'0') : null;
      if (param) {
        const br = await axios.post(`${TRON_NODE}/wallet/triggerconstantcontract`, {
          owner_address: TRON_HOT, contract_address: USDT_CONTRACT,
          function_selector: 'balanceOf(address)', parameter: param, visible: true
        }, { timeout: 15000 });
        if (br.data?.constant_result?.[0]) realBack.USDT = Number(BigInt('0x'+br.data.constant_result[0]))/1e6;
      }
    } catch {}
    console.log(`  TRON hot wallet (${TRON_HOT}):`);
    console.log(`    TRX: ${realBack.TRX.toLocaleString(undefined,{maximumFractionDigits:6})}  ≈ $${(realBack.TRX*0.12).toFixed(2)}`);
    console.log(`    USDT: $${realBack.USDT.toLocaleString(undefined,{maximumFractionDigits:6})}`);
    totalBackUsd += realBack.USDT + realBack.TRX * 0.12;
  }

  // Binance Spot
  if (!APIKEY || !APISEC || isPlaceholder(APIKEY) || isPlaceholder(APISEC)) {
    console.log('\n  ⚠ Binance Spot skipped: keys not set or placeholder.\n');
  } else {
    try {
      const ts = Date.now();
      const signed = sign({ timestamp: ts, recvWindow: 10000 }, APISEC);
      const r = await axios.get(`${BASE}/api/v3/account?${signed}`, { headers: { 'X-MBX-APIKEY': APIKEY }, timeout: 15000 });
      let price = { USDT: 1 };
      try { const pp = await axios.get(`${BASE}/api/v3/ticker/price`, { timeout: 8000 }); (pp.data||[]).forEach(rr => { if (rr.symbol.endsWith('USDT')) price[rr.symbol.slice(0,-4)] = parseFloat(rr.price)||0; }); } catch {}
      const bals = (r.data.balances||[]).map(b => ({ asset: b.asset, total: parseFloat(b.free||0)+parseFloat(b.locked||0) })).filter(b => b.total > 1e-12);
      console.log('\n  Binance Spot wallet:');
      let binUsd = 0;
      console.log('  '+('ASSET'.padEnd(8))+('BALANCE'.padStart(22))+(' ≈ USD'.padStart(14)));
      console.log('  ' + '─'.repeat(46));
      bals.sort((a,b)=> (b.total*(price[b.asset]||0)) - (a.total*(price[a.asset]||0))).forEach(b => {
        const p = price[b.asset] || 0;
        const u = b.total * p;
        if (u < 0.01) return;
        realBinance[b.asset] = (realBinance[b.asset]||0) + b.total;
        realBack[b.asset] = (realBack[b.asset]||0) + b.total;
        binUsd += u;
        console.log('  '+b.asset.padEnd(8)+b.total.toLocaleString(undefined,{maximumFractionDigits:6}).padStart(22)+('  $'+u.toLocaleString(undefined,{maximumFractionDigits:2})).padStart(14));
      });
      console.log('  ' + '─'.repeat(46));
      console.log('  → Binance Spot total AUM ≈'.padEnd(31), '$'+binUsd.toLocaleString(undefined,{maximumFractionDigits:2}));
      totalBackUsd += binUsd - realBack.USDT; // avoid double-count USDT
    } catch (e) {
      console.log('\n  ❌ Binance read error:', e.response?.status, (e.response?.data?.msg||e.message||'').toString().slice(0,200));
    }
  }
  console.log();

  // Section E: FIDUCIARY BACKING TEST
  console.log('═══ E. BACKING RATIO — CAN YOU HONOUR ALL CUSTOMER WITHDRAWALS RIGHT NOW? ═══\n');

  const coins = Array.from(new Set([...Object.keys(cryptoLiab), ...Object.keys(realBack)])).filter(c => (cryptoLiab[c]||0) > 1e-12 || (realBack[c]||0) > 1e-12);
  // Also add Binance-only coins for completeness
  Object.keys(realBinance).forEach(c => { if (!coins.includes(c)) coins.push(c); });

  let priceCache3 = { USDT:1 };
  try { const pp = await axios.get(`${BASE}/api/v3/ticker/price`, { timeout: 8000 }); (pp.data||[]).forEach(rr => { if (rr.symbol.endsWith('USDT')) priceCache3[rr.symbol.slice(0,-4)] = parseFloat(rr.price) || 0; }); } catch {}
  priceCache3.TRX = priceCache3.TRX || 0.12;

  console.log('  '+('COIN'.padEnd(8))+('CUSTOMERS OWED (SQLite)'.padStart(26))+('REAL HOLDINGS (on-chain + Binance)'.padStart(34))+('SHORTFALL'.padStart(22))+('BACKED %'.padStart(10)));
  console.log('  ' + '─'.repeat(100));
  let totalOwedUsd = 0, totalOwnedUsd = 0, totalGapUsd = 0;
  coins.forEach(c => {
    const owed = cryptoLiab[c] || 0;
    const owned = realBack[c] || 0;
    const price = priceCache3[c] || 0;
    const gap = owed - owned;
    const pct = owed > 0 ? Math.min(100, (owned / owed) * 100) : (owned>0?100:0);
    const owedUsd = owed * price;
    const ownedUsd = owned * price;
    const gapUsd = Math.max(0, gap * price);
    totalOwedUsd += owedUsd;
    totalOwnedUsd += ownedUsd;
    totalGapUsd += gapUsd;
    const flag = pct >= 100 ? '✅' : pct >= 50 ? '⚠ ' : pct > 0 ? '🔴' : '❌';
    console.log(
      '  '+(flag+c).padEnd(8)+
      owed.toLocaleString(undefined,{maximumFractionDigits:6}).padStart(26)+
      owned.toLocaleString(undefined,{maximumFractionDigits:6}).padStart(34)+
      (gap > 0 ? '-'+gap.toLocaleString(undefined,{maximumFractionDigits:6}) : '0').padStart(22)+
      (pct.toFixed(1)+'%').padStart(10)
    );
  });
  console.log('  ' + '─'.repeat(100));
  const ratio = totalOwedUsd>0 ? (totalOwnedUsd/totalOwedUsd*100) : 100;
  console.log(`\n  💰 LIABILITIES (what customers think they have, in USD):     $${totalOwedUsd.toLocaleString(undefined,{maximumFractionDigits:2})}`);
  console.log(`  🏦 REAL BACKING (actual crypto you control, in USD):          $${totalOwnedUsd.toLocaleString(undefined,{maximumFractionDigits:2})}`);
  console.log(`  📉 NET SHORTFALL (unbacked customer claims, USD approx):     $${totalGapUsd.toLocaleString(undefined,{maximumFractionDigits:2})}`);
  console.log(`  📊 OVERALL BACKING RATIO:                                    ${ratio.toFixed(2)} %`);
  console.log();
  console.log(ratio >= 100
    ? '  ✅ PASS: Customer funds are FULLY BACKED (≥ 100%). You can honour all withdrawals.'
    : ratio >= 50
      ? '  ⚠  MARGINAL: <50% backed. Many customers will not be able to withdraw if they all try at once. Deposit more real crypto into backing wallets.'
      : ratio > 0
        ? '  🔴 FAIL: CRITICALLY under-backed. Do NOT advertise withdrawals. System will fail once real backing is exhausted.'
        : '  ❌ ZERO BACKING: There is absolutely 0 real crypto backing ANY customer wallet balance. All customer crypto balances are currently SQL-only entries with NO redeemable backing.'
  );

  // Section F: How real backing is used when a customer withdraws
  console.log('\n─── F. HOW REAL BACKING IS CONSUMED ON WITHDRAWAL ───\n');
  console.log('  When a customer calls POST /api/wallets/crypto-withdraw (wallets.router L21):');
  console.log('  Step 1:  customer_wallets table → balance - amount  (SQLite liability reduced)');
  console.log('  Step 2:  IF coin=USDT AND network=TRX/Tron → TIER 1 DIRECT TRON RAIL:');
  console.log('             └─ on-chain: hot wallet (' + (TRON_HOT || '(no address)') + ') sends USDT-TRC20 → customer addr');
  console.log('             └─ burns REAL USDT from your on-chain wallet.  Reference: tronweb.service.ts L66-L125');
  console.log('  Step 3:  ELSE → TIER 2 BINANCE WITHDRAWAL RAIL:');
  console.log('             └─ Binance API sends real crypto from Binance Spot → external address');
  console.log('             └─ burns REAL crypto from your Binance Spot wallet.  Reference: binance.service.ts withdrawAsset L250-L380');
  console.log('');

  if (db) try { db.close(); } catch {}
})().catch(e => {
  console.error('\nFATAL:', e.message || e);
  if (e.response) console.error('  HTTP', e.response.status, JSON.stringify(e.response.data||{}).slice(0,500));
  console.error(e.stack);
  process.exit(1);
});
