const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (s, p=[]) => new Promise((rs,rj)=>db.all(s,p,(e,r)=>e?rj(e):rs(r)));
(async () => {
  const rows = await Q(`SELECT id, customer_id, crypto_coin, transaction_type, fiat_amount, crypto_amount, fiat_currency, exchange_rate, source, status, provider_mode, reference, substr(created_at,1,19) AS t  FROM crypto_transactions ORDER BY datetime(created_at) DESC LIMIT 20`);
  console.log('Last 20 crypto_transactions (newest first):\n');
  rows.forEach(r => console.log(`  ${r.t}  [${r.status.padEnd(9)}] ${String(r.transaction_type).padEnd(11)} ${String(r.customer_id).slice(0,10).padEnd(10)}  $${r.fiat_amount.toFixed(2).padStart(9)} → ${Number(r.crypto_amount).toFixed(8).padStart(18)} ${r.crypto_coin.padEnd(5)}  ${r.provider_mode}  src=${r.source||''}  ref=${r.reference||''}`));
  const cust = await Q(`SELECT id, name FROM customers`);
  console.log('\nCustomers:');
  cust.forEach(c => console.log(`  ${c.id}  ${c.name}`));
  db.close();
})();
