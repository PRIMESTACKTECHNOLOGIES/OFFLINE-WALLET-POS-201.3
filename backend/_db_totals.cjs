const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (sql, p=[]) => new Promise((rs,rj)=>db.all(sql,p,(e,r)=>e?rj(e):rs(r)));

(async () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║            DATABASE STORED AMOUNTS — TOTAL SUMMARY            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  // ── 1. Customer Wallets (Fiat) ──
  const cw = await Q(`
    SELECT COALESCE(SUM(balance),0) AS total, currency, COUNT(*) AS wallets
    FROM customer_wallets WHERE status='active' GROUP BY currency`);
  console.log('═══ 1. CUSTOMER FIAT WALLETS ═══');
  let grandFiat = 0;
  cw.forEach(r => {
    console.log(`   ${r.wallets} wallet(s)  →  $${r.total.toFixed(2)} ${r.currency}`);
    grandFiat += r.total;
  });
  if (cw.length===0) console.log('   (empty — $0.00)');
  console.log(`   CUSTOMER FIAT TOTAL → $${grandFiat.toFixed(2)} USD`);
  console.log('');

  // ── 2. Merchant Wallets ──
  const mw = await Q(`
    SELECT COALESCE(SUM(balance),0) AS total, currency, COUNT(*) AS wallets
    FROM merchant_wallets GROUP BY currency`);
  console.log('═══ 2. MERCHANT FIAT WALLETS ═══');
  let merchFiat = 0;
  mw.forEach(r => {
    console.log(`   ${r.wallets} wallet(s)  →  $${r.total.toFixed(2)} ${r.currency}`);
    merchFiat += r.total;
  });
  console.log(`   MERCHANT FIAT TOTAL → $${merchFiat.toFixed(2)} USD`);
  console.log('');

  // ── 3. Virtual Cards ──
  const vc = await Q(`
    SELECT COALESCE(SUM(balance),0) AS total, currency, COUNT(*) AS cards
    FROM virtual_cards WHERE status='ACTIVE' GROUP BY currency`);
  console.log('═══ 3. VIRTUAL CARDS ═══');
  let vcFiat = 0;
  vc.forEach(r => {
    console.log(`   ${r.cards} card(s)  →  $${r.total.toFixed(2)} ${r.currency}`);
    vcFiat += r.total;
  });
  if (vc.length===0) console.log('   (empty — $0.00)');
  console.log(`   VIRTUAL CARD TOTAL → $${vcFiat.toFixed(2)} USD`);
  console.log('');

  // ── 4. Customer Crypto Wallets (valued in USD) ──
  const ccr = await Q(`
    SELECT w.crypto_coin, COALESCE(SUM(w.balance),0) AS total_bal
    FROM customer_crypto_wallets w WHERE w.status='active'
    GROUP BY w.crypto_coin`);
  // Get latest rates from crypto_transactions
  const rates = await Q(`
    SELECT crypto_coin, exchange_rate FROM crypto_transactions
    WHERE status='completed' ORDER BY datetime(created_at) DESC`);
  const rateMap = {};
  rates.forEach(r => { if (!rateMap[r.crypto_coin]) rateMap[r.crypto_coin] = r.exchange_rate; });

  console.log('═══ 4. CUSTOMER CRYPTO HOLDINGS ═══');
  let cryptoUSD = 0;
  ccr.forEach(r => {
    const rate = rateMap[r.crypto_coin] || 0;
    const usdVal = r.total_bal * rate;
    cryptoUSD += usdVal;
    console.log(`   ${r.crypto_coin}: ${r.total_bal.toFixed(8)} @ $${rate} → $${usdVal.toFixed(2)} USD`);
  });
  if (ccr.length===0) console.log('   (no crypto holdings)');
  console.log(`   CRYPTO VALUATION TOTAL → $${cryptoUSD.toFixed(2)} USD`);
  console.log('');

  // ── 5. Wallet Transaction Volumes ──
  const wt = await Q(`
    SELECT type, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
    FROM wallet_transactions GROUP BY type`);
  console.log('═══ 5. WALLET TRANSACTION VOLUMES (LIFETIME) ═══');
  wt.forEach(r => console.log(`   ${r.type.toUpperCase()}: $${r.total.toFixed(2)} (${r.count} txns)`));
  if (wt.length===0) console.log('   (no wallet transactions)');
  console.log('');

  // ── 6. Crypto Transaction Volumes (BUY/SELL fiat flow) ──
  const ct = await Q(`
    SELECT transaction_type, COALESCE(SUM(fiat_amount),0) AS total_fiat,
           COUNT(*) AS count
    FROM crypto_transactions WHERE status='completed'
    GROUP BY transaction_type`);
  console.log('═══ 6. CRYPTO FIAT FLOWS (LIFETIME) ═══');
  ct.forEach(r => console.log(`   ${r.transaction_type.toUpperCase()}: $${r.total_fiat.toFixed(2)} (${r.count} txns)`));
  if (ct.length===0) console.log('   (no crypto trades)');
  console.log('');

  // ── 7. Ledger Totals ──
  const led = await Q(`
    SELECT type, currency, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
    FROM ledger_entries GROUP BY type, currency`);
  console.log('═══ 7. GENERAL LEDGER (JOURNAL) ═══');
  led.forEach(r => console.log(`   ${r.type.toUpperCase()} $${r.total.toFixed(2)} ${r.currency} (${r.count} entries)`));
  console.log('');

  // ── GRAND TOTAL ──
  const systemTotal = grandFiat + merchFiat + vcFiat + cryptoUSD;
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║  GRAND SYSTEM-WIDE TOTAL (stored value)                       ║`);
  console.log(`║  Customer Fiat Wallets   : $${String(grandFiat.toFixed(2)).padStart(10)} USD            ║`);
  console.log(`║  Merchant Fiat Wallets   : $${String(merchFiat.toFixed(2)).padStart(10)} USD            ║`);
  console.log(`║  Virtual Card Balances   : $${String(vcFiat.toFixed(2)).padStart(10)} USD            ║`);
  console.log(`║  Crypto Holdings (mark)  : $${String(cryptoUSD.toFixed(2)).padStart(10)} USD            ║`);
  console.log(`║  ────────────────────────────────────────────────────────    ║`);
  console.log(`║  NET STORED VALUE TOTAL  : $${String(systemTotal.toFixed(2)).padStart(10)} USD            ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  db.close();
})().catch(e=>{console.error(e);db.close();process.exit(1);});
