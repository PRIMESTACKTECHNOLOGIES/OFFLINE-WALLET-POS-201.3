const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');

(async function main() {
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.run('BEGIN');
  async function exec(sql, params = []) {
    try {
      const r = await db.run(sql, params);
      console.log('OK ', sql.slice(0, 90).padEnd(92), 'changes=', r.changes || 0);
    } catch (e) { console.log('ERR', sql.slice(0, 90).padEnd(92), e.message.slice(0, 120)); }
  }
  await exec("DELETE FROM wallet_transactions WHERE customer_id IN (SELECT id FROM customers WHERE name = 'POST-RESET-TEST')");
  await exec("DELETE FROM customer_wallets WHERE customer_id IN (SELECT id FROM customers WHERE name = 'POST-RESET-TEST')");
  await exec("DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM customers WHERE name = 'POST-RESET-TEST')");
  await exec("DELETE FROM customers WHERE name = 'POST-RESET-TEST'");
  await db.run('COMMIT');
  const cnt = await db.get("SELECT COUNT(*) as c FROM customers");
  const cntW = await db.get("SELECT COUNT(*) as c FROM customer_wallets");
  const mUSD = await db.get("SELECT balance FROM merchant_wallets WHERE currency='USD' AND merchant_id='MRC-1001'");
  const mAED = await db.get("SELECT balance FROM merchant_wallets WHERE currency='AED' AND merchant_id='MRC-1001'");
  console.log('\nCLEAN STATE CHECK:');
  console.log('  customers:        ', cnt.c);
  console.log('  customer_wallets: ', cntW.c);
  console.log('  merchant MRC-1001 USD: $', Number(mUSD.balance));
  console.log('  merchant MRC-1001 AED: ', Number(mAED.balance));
  await db.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
