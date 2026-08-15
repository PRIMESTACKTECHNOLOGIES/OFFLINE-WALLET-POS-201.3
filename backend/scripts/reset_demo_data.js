const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');

(async function main() {
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.run('BEGIN');
  const exec = async (sql, params = []) => {
    try {
      const r = await db.run(sql, params);
      console.log('OK   ', sql.split('\n')[0].slice(0, 90).padEnd(92), 'changes=', r.changes || 0);
    } catch (e) {
      console.log('ERR  ', sql.split('\n')[0].slice(0, 90).padEnd(92), e.message.slice(0, 120));
    }
  };

  // 1. CUSTOMERS + their wallets + transactions (100% demo, 0 real, delete all)
  await exec('DELETE FROM wallet_transfers');
  await exec('DELETE FROM wallet_transactions');
  await exec('DELETE FROM crypto_transactions');
  await exec('DELETE FROM incoming_payments');
  await exec('DELETE FROM offline_funds_receipts');
  await exec('DELETE FROM cashout_transactions');
  await exec('DELETE FROM cashouts');
  await exec('DELETE FROM customer_crypto_wallets');
  await exec('DELETE FROM customer_wallets');
  await exec('DELETE FROM user_sessions');
  await exec('DELETE FROM customers');

  // 2. MERCHANT wallets, transactions, payouts (reset balances, delete tx/payouts only)
  //    Keep the wallet rows so the app still finds "MRC-1001 USD / AED wallets"
  await exec("UPDATE merchant_wallets SET balance = 0 WHERE 1=1");
  await exec('DELETE FROM merchant_wallet_transactions');
  await exec('DELETE FROM merchant_payouts');
  await exec('DELETE FROM bank_payouts');
  await exec('DELETE FROM merchant_crypto_balances');
  await exec('DELETE FROM merchant_pos_settlements');
  await exec('DELETE FROM settlement_discrepancies');
  await exec('DELETE FROM payment_codes');

  // 3. Transactions / Batches / POS flows (100% stand-in demo — delete all)
  await exec('DELETE FROM pos2013_transactions');
  await exec('DELETE FROM pos2013_batches');
  await exec('DELETE FROM pos_idempotency');
  await exec('DELETE FROM ledger_entries');
  await exec('DELETE FROM receipts');

  // 4. Bootstrap config KEEPERS (do not touch):
  //    - merchant_settings        (MRC-1001)
  //    - merchant_business_info   (if any)
  //    - terminals                (T2013-001)
  //    - products                 (AI WEBHOOK + anything operator manually added)
  //    - admin_users              (operator logins)
  //    - bank_accounts            (if any configured by operator)
  console.log('SKIP merchant_settings / merchant_business_info / terminals / products / admin_users / bank_accounts — keep as operator config.');

  await db.run('COMMIT');
  console.log('\n=== POST-RESET SANITY CHECK ===');
  const counts = [
    ['customers',     'SELECT COUNT(*) FROM customers'],
    ['cust_wallets',  'SELECT COUNT(*) FROM customer_wallets'],
    ['cust_crypto',   'SELECT COUNT(*) FROM customer_crypto_wallets'],
    ['wallet_tx',     'SELECT COUNT(*) FROM wallet_transactions'],
    ['crypto_tx',     'SELECT COUNT(*) FROM crypto_transactions'],
    ['pos_tx',        'SELECT COUNT(*) FROM pos2013_transactions'],
    ['pos_batches',   'SELECT COUNT(*) FROM pos2013_batches'],
    ['ledger',        'SELECT COUNT(*) FROM ledger_entries'],
    ['receipts',      'SELECT COUNT(*) FROM receipts'],
    ['merch_wallets', 'SELECT merchant_id || \'-\' || currency || \'=$\' || balance FROM merchant_wallets'],
    ['terminals',     'SELECT COUNT(*) FROM terminals'],
    ['products',      'SELECT COUNT(*) FROM products'],
    ['merch_settings','SELECT COUNT(*) FROM merchant_settings'],
  ];
  for (const [k,sql] of counts) {
    try {
      const rows = await db.all(sql);
      console.log('  ', k.padEnd(16), rows.length === 1 ? Object.values(rows[0])[0] : rows.map(r => Object.values(r)[0]).join(' ; '));
    } catch (e) { console.log('  ', k.padEnd(16), 'ERR', e.message.slice(0,80)); }
  }

  await db.close();
  console.log('\nDone. Demo money/crypto/customers removed. Only operator bootstrap config remains.');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
