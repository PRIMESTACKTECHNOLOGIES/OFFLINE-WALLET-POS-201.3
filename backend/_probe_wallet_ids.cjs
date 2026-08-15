const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (sql, p=[]) => new Promise((rs,rj)=>db.all(sql,p,(e,r)=>e?rj(e):rs(r)));

(async () => {
  console.log('── PROBE WALLET IDs ──');
  const cust = await Q(`SELECT c.id AS customer_id, c.name, w.id AS wallet_id, w.wallet_code, w.balance, w.currency
    FROM customers c LEFT JOIN customer_wallets w ON w.customer_id=c.id
    WHERE c.id='1e109c8a-3fc6-4aa7-bfc2-e882ee339e1d' OR c.name LIKE '%HARRIS%'`);
  console.log('\nMR.HARRIS wallets:');
  cust.forEach(r=>console.log(JSON.stringify(r)));

  const merch = await Q(`SELECT * FROM merchant_wallets WHERE merchant_id LIKE 'MRC-1001%'`);
  console.log('\nMerchant wallets:');
  merch.forEach(r=>console.log(JSON.stringify(r)));

  const cols = await Q(`PRAGMA table_info(customer_wallets)`);
  console.log('\ncustomer_wallets cols:');
  cols.forEach(r=>console.log(r.name, r.type));

  const cols2 = await Q(`PRAGMA table_info(merchant_wallets)`);
  console.log('\nmerchant_wallets cols:');
  cols2.forEach(r=>console.log(r.name, r.type));

  const cols3 = await Q(`PRAGMA table_info(wallet_transactions)`);
  console.log('\nwallet_transactions cols:');
  cols3.forEach(r=>console.log(r.name, r.type));

  const cols4 = await Q(`PRAGMA table_info(merchant_wallet_transactions)`);
  console.log('\nmerchant_wallet_transactions cols:');
  cols4.forEach(r=>console.log(r.name, r.type));

  const cols5 = await Q(`PRAGMA table_info(ledger_entries)`);
  console.log('\nledger_entries cols:');
  cols5.forEach(r=>console.log(r.name, r.type));

  db.close();
})().catch(e=>{console.error(e);db.close();process.exit(1);});
