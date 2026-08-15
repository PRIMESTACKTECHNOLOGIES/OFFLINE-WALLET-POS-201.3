const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (sql, p=[]) => new Promise((rs,rj)=>db.all(sql,p,(e,r)=>e?rj(e):rs(r)));

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  SYSTEM-WIDE CRYPTO HOLDINGS + TRANSACTION HISTORY (QUANTITY)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // 1. Customer crypto wallets
  console.log('── 1. CUSTOMER CRYPTO WALLETS ────────────────────────────────────');
  const cc = await Q(`SELECT c.name, c.id AS customer_id, w.*
    FROM customer_crypto_wallets w LEFT JOIN customers c ON c.id=w.customer_id
    ORDER BY w.crypto_coin, datetime(w.created_at)`);
  if (cc.length === 0) console.log('  (empty — no customer crypto yet)');
  const coinTotals = {};
  cc.forEach(r => {
    const key = r.crypto_coin;
    if (!coinTotals[key]) coinTotals[key] = { qty: 0, customers: 0, valueUSD: 0, rate: 0 };
    coinTotals[key].qty += Number(r.balance||0);
    coinTotals[key].customers++;
    console.log(`  • ${(r.name||r.customer_id.slice(0,8)).padEnd(28)}  ${r.crypto_coin.padEnd(5)}  bal=${Number(r.balance||0).toFixed(8)}  addr=${r.crypto_address||'(internal-only)'}  [${r.status}]`);
  });
  console.log('');

  // 2. Merchant crypto balances (vault)
  console.log('── 2. MERCHANT CRYPTO VAULT ──────────────────────────────────────');
  try {
    const mc = await Q(`SELECT * FROM merchant_crypto_balances ORDER BY crypto_coin`);
    if (mc.length === 0) console.log('  (empty — no merchant crypto vault yet)');
    mc.forEach(r => {
      const key = r.crypto_coin;
      if (!coinTotals[key]) coinTotals[key] = { qty: 0, customers: 0, valueUSD: 0, rate: 0, merchantQty: 0 };
      coinTotals[key].merchantQty = (coinTotals[key].merchantQty||0) + Number(r.balance||0);
      console.log(`  • merchant=${r.merchant_id||'(global)'}  ${r.crypto_coin.padEnd(5)}  bal=${Number(r.balance||0).toFixed(8)}  [${r.status||'active'}]`);
    });
  } catch(e) {
    console.log('  (merchant_crypto_balances table missing —', e.message.split('\n')[0], ')');
  }
  console.log('');

  // 3. Latest exchange rates from crypto_transactions (for valuation)
  console.log('── 3. LATEST EXCHANGE RATES (from completed buys) ───────────────');
  const rates = await Q(`SELECT crypto_coin, exchange_rate, fiat_amount, crypto_amount,
    substr(created_at,1,19) AS t FROM crypto_transactions WHERE status='completed'
    ORDER BY datetime(created_at) DESC`);
  const rateMap = {};
  rates.forEach(r => { if (!rateMap[r.crypto_coin]) { rateMap[r.crypto_coin] = r; } });
  Object.keys(rateMap).forEach(coin => {
    const r = rateMap[coin];
    console.log(`  • ${coin.padEnd(5)}  1 ${coin} = $${r.exchange_rate} USD   (last tx: ${r.t}  $${r.fiat_amount} → ${Number(r.crypto_amount).toFixed(8)} ${coin})`);
    if (coinTotals[coin]) coinTotals[coin].rate = r.exchange_rate;
  });
  console.log('');

  // 4. Crypto transaction bookkeeping
  console.log('── 4. CRYPTO TRANSACTIONS (ALL — BUY/SELL/WITHDRAW) ─────────────');
  const all = await Q(`SELECT t.*, c.name FROM crypto_transactions t
    LEFT JOIN customers c ON c.id=t.customer_id ORDER BY datetime(t.created_at) DESC`);
  let buyFiat=0, buyQty={}, sellFiat=0, sellQty={}, withdrawQty={};
  all.forEach(t => {
    const amt = Number(t.crypto_amount||0);
    const fiat = Number(t.fiat_amount||0);
    const tt = (t.transaction_type||'').toLowerCase();
    if (tt === 'buy') { buyFiat += fiat; buyQty[t.crypto_coin]=(buyQty[t.crypto_coin]||0)+amt; }
    else if (tt === 'sell') { sellFiat += fiat; sellQty[t.crypto_coin]=(sellQty[t.crypto_coin]||0)+amt; }
    else if (tt.includes('withdraw')) { withdrawQty[t.crypto_coin]=(withdrawQty[t.crypto_coin]||0)+amt; }
    console.log(`  • ${String(t.status||'').padEnd(14)} ${tt.padEnd(12)} ${String(t.name||t.customer_id||'MERCHANT').slice(0,14).padEnd(14)} $${fiat.toFixed(2).padStart(8)} → ${amt.toFixed(8).padStart(16)} ${t.crypto_coin.padEnd(5)} src=${t.source||''} ${t.tx_hash?`[tx:${t.tx_hash.slice(0,10)}…]`:''}  ref="${t.reference||''}"`);
  });
  console.log('');
  console.log(`  Lifetime BUY  total: $${buyFiat.toFixed(2)}  (${Object.keys(buyQty).map(c=>(buyQty[c]).toFixed(8)+' '+c).join(' + ')})`);
  console.log(`  Lifetime SELL total: $${sellFiat.toFixed(2)}`);
  if (Object.keys(withdrawQty).length) console.log(`  Lifetime WITHDRAW : ${Object.keys(withdrawQty).map(c=>(withdrawQty[c]).toFixed(8)+' '+c).join(' + ')}`);
  console.log('');

  // 5. Grand total crypto holdings (quantity + USD mark-to-market)
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('  AGGREGATE CRYPTO HOLDINGS QUANTITY (SYSTEM TOTAL)');
  console.log('───────────────────────────────────────────────────────────────────');
  let grandUSD = 0;
  Object.keys(coinTotals).forEach(coin => {
    const t = coinTotals[coin];
    const cust = t.qty;
    const merch = t.merchantQty || 0;
    const totalQty = cust + merch;
    const usd = totalQty * (t.rate||0);
    grandUSD += usd;
    console.log('');
    console.log(`  💰 ${coin}`);
    console.log(`       Customer wallets  : ${cust.toFixed(8)} ${coin}`);
    if (merch) console.log(`       Merchant vault    : ${merch.toFixed(8)} ${coin}`);
    console.log(`     ─────────────────────────────────────`);
    console.log(`       SYSTEM TOTAL QTY  : ${totalQty.toFixed(8)} ${coin}`);
    console.log(`       Last rate (mark)  : 1 ${coin} = $${t.rate||0} USD`);
    console.log(`       Mark-to-Market    : $${usd.toFixed(2)} USD`);
  });
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  🌐 TOTAL CRYPTO PORTFOLIO VALUE  →  $${grandUSD.toFixed(2)} USD`);
  console.log('═══════════════════════════════════════════════════════════════════');

  db.close();
})().catch(e=>{console.error(e);db.close();process.exit(1);});
