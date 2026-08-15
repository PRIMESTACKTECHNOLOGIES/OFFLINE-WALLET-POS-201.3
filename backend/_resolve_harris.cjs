const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (sql, p=[]) => new Promise((rs,rj)=>db.all(sql,p,(e,r)=>e?rj(e):rs(r)));

(async () => {
  console.log('── MR.HARRIS CUSTOMERS IN DB ──');
  const all = await Q(`SELECT id, name, created_at FROM customers WHERE LOWER(name) LIKE '%harris%'`);
  for (const c of all) {
    console.log(`\nCUSTOMER: ${c.name}`);
    console.log(`  id         : ${c.id}`);
    console.log(`  created_at : ${c.created_at}`);
    const wals = await Q(`SELECT id, wallet_code, currency, balance, updated_at FROM customer_wallets WHERE customer_id=?`, [c.id]);
    console.log(`  fiat wallets (${wals.length}):`);
    wals.forEach(w => console.log(`     · [${w.currency}] ${w.wallet_code}  bal=${w.balance}  (id ${w.id.slice(0,8)}…)`));
    const crypt = await Q(`SELECT id, crypto_coin, balance, status FROM customer_crypto_wallets WHERE customer_id=?`, [c.id]);
    console.log(`  crypto wallets (${crypt.length}):`);
    crypt.forEach(w => console.log(`     · ${w.crypto_coin.padEnd(5)} bal=${Number(w.balance).toFixed(8)}   [${w.status}]  (id ${w.id.slice(0,8)}…)`));
    const txs = await Q(`SELECT type, amount, currency, substr(created_at,1,19) AS t FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM customer_wallets WHERE customer_id=?) ORDER BY datetime(created_at) DESC`, [c.id]);
    console.log(`  recent fiat tx (${txs.length}):`);
    txs.slice(0,8).forEach(t => console.log(`     · ${t.t.padEnd(19)} ${t.type.padEnd(7)} ${t.amount} ${t.currency}`));
  }
  console.log('\n── ALL customers with non-zero USD wallets ──');
  const nz = await Q(`SELECT c.id, c.name, w.wallet_code, w.currency, w.balance FROM customer_wallets w LEFT JOIN customers c ON c.id=w.customer_id WHERE w.currency='USD' ORDER BY w.balance DESC`);
  nz.forEach(r => console.log(`  USD bal=$${String(r.balance).padStart(10)}  ${r.name?.slice(0,28)??'(no-name)'}  (${r.wallet_code})  custID=${r.id?.slice(0,8)}…`));
  db.close();
})();
