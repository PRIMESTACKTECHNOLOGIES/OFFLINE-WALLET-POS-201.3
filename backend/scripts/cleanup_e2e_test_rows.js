const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

(async () => {
  const dbPath = process.env.DATABASE_PATH
    ? path.resolve(__dirname, '..', process.env.DATABASE_PATH)
    : path.resolve(__dirname, '..', 'data', 'database.sqlite');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec('PRAGMA journal_mode = WAL;');

  console.log('═════════════════════════════════════════════════════════════');
  console.log('  CLEANUP: remove E2E flowchart test rows inserted today');
  console.log('  Keep only: merchant_settings, terminals, products, admin_users');
  console.log('═════════════════════════════════════════════════════════════\n');

  const countsBefore = await db.get(`
    SELECT
      (SELECT COUNT(*) FROM customers) customers,
      (SELECT COUNT(*) FROM customer_wallets) cust_wallets,
      (SELECT COUNT(*) FROM wallet_transactions) cust_tx,
      (SELECT COUNT(*) FROM crypto_transactions) cust_crypto_tx,
      (SELECT COUNT(*) FROM customer_crypto_wallets) cust_crypto_w,
      (SELECT COUNT(*) FROM merchant_wallet_transactions WHERE wallet_id IN (SELECT id FROM merchant_wallets WHERE merchant_id='MRC-1001')) merch_tx,
      (SELECT COUNT(*) FROM merchant_crypto_balances WHERE merchant_id='MRC-1001') merch_crypto,
      (SELECT COUNT(*) FROM merchant_pos_settlements WHERE merchant_id='MRC-1001') merch_settlements,
      (SELECT COUNT(*) FROM pos2013_transactions) pos_tx,
      (SELECT COUNT(*) FROM pos2013_batches) pos_batches,
      (SELECT COUNT(*) FROM pos_idempotency) pos_idem,
      (SELECT COUNT(*) FROM ledger_entries) ledger,
      (SELECT SUM(balance) FROM merchant_wallets WHERE merchant_id='MRC-1001') merch_total
  `);
  console.log('[BEFORE CLEANUP] counts:');
  console.log(JSON.stringify(countsBefore, null, 2));
  console.log('');

  const DEL = [
    `DELETE FROM merchant_crypto_balances WHERE merchant_id='MRC-1001'`,
    `DELETE FROM merchant_pos_settlements WHERE merchant_id='MRC-1001'`,
    `DELETE FROM merchant_wallet_transactions WHERE wallet_id IN (SELECT id FROM merchant_wallets WHERE merchant_id='MRC-1001')`,
    `DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM customer_wallets WHERE customer_id IN (SELECT id FROM customers WHERE name IN ('POST-RESET-TEST','E2E-FLOWCHART-TEST')))`,
    `DELETE FROM customer_crypto_wallets WHERE customer_id IN (SELECT id FROM customers WHERE name IN ('POST-RESET-TEST','E2E-FLOWCHART-TEST'))`,
    `DELETE FROM crypto_transactions WHERE customer_id IN (SELECT id FROM customers WHERE name IN ('POST-RESET-TEST','E2E-FLOWCHART-TEST'))`,
    `DELETE FROM customers WHERE name IN ('POST-RESET-TEST','E2E-FLOWCHART-TEST')`,
    `DELETE FROM pos2013_transactions`,
    `DELETE FROM pos2013_batches`,
    `DELETE FROM pos_idempotency`,
    `DELETE FROM merchant_payouts`,
    `DELETE FROM bank_payouts`,
    `DELETE FROM cashout_transactions`,
    `DELETE FROM cashouts`,
    `DELETE FROM incoming_payments`,
    `DELETE FROM wallet_transfers`,
    `DELETE FROM payment_codes`,
    `DELETE FROM receipts`,
    `DELETE FROM offline_funds_receipts`,
    `DELETE FROM settlement_discrepancies`,
    `DELETE FROM ledger_entries WHERE description LIKE '%FLOWCHART%' OR description LIKE '%POS_OFFLINE%' OR description LIKE '%Merchant crypto purchase%' OR description LIKE '%Merchant wallet debit: merchant_crypto_purchase%'`,
    `UPDATE merchant_wallets SET balance=0, updated_at=CURRENT_TIMESTAMP WHERE merchant_id='MRC-1001'`,
    `DELETE FROM user_sessions`,
  ];
  for (const q of DEL) {
    const info = await db.run(q);
    const affected = (info && info.changes) || 0;
    if (affected) console.log(`  ✅ ${affected} rows → ${q.split('WHERE')[0].slice(0, 60)}`);
  }

  const countsAfter = await db.get(`
    SELECT
      (SELECT COUNT(*) FROM customers) customers,
      (SELECT COUNT(*) FROM customer_wallets) cust_wallets,
      (SELECT COUNT(*) FROM wallet_transactions) cust_tx,
      (SELECT COUNT(*) FROM crypto_transactions) cust_crypto_tx,
      (SELECT COUNT(*) FROM customer_crypto_wallets) cust_crypto_w,
      (SELECT COUNT(*) FROM merchant_wallet_transactions WHERE wallet_id IN (SELECT id FROM merchant_wallets WHERE merchant_id='MRC-1001')) merch_tx,
      (SELECT COUNT(*) FROM merchant_crypto_balances WHERE merchant_id='MRC-1001') merch_crypto,
      (SELECT COUNT(*) FROM merchant_pos_settlements WHERE merchant_id='MRC-1001') merch_settlements,
      (SELECT COUNT(*) FROM pos2013_transactions) pos_tx,
      (SELECT COUNT(*) FROM pos2013_batches) pos_batches,
      (SELECT COUNT(*) FROM pos_idempotency) pos_idem,
      (SELECT COUNT(*) FROM ledger_entries) ledger,
      (SELECT COALESCE(SUM(balance),0) FROM merchant_wallets WHERE merchant_id='MRC-1001') merch_total
  `);
  console.log('\n[AFTER CLEANUP] counts:');
  console.log(JSON.stringify(countsAfter, null, 2));

  const keepers = await db.get(`
    SELECT
      (SELECT COUNT(*) FROM terminals) terminals,
      (SELECT COUNT(*) FROM products) products,
      (SELECT COUNT(*) FROM merchant_settings) merch_settings,
      (SELECT COUNT(*) FROM admin_users) admin_users,
      (SELECT COUNT(*) FROM bank_accounts) bank_accounts
  `);
  console.log('\n[KEEPER CONFIG (NOT DELETED)]:');
  console.log(JSON.stringify(keepers, null, 2));

  const balances = await db.all('SELECT currency, balance FROM merchant_wallets WHERE merchant_id=? ORDER BY currency', ['MRC-1001']);
  console.log('\n[MRC-1001 balances — fresh zero state]:');
  balances.forEach(b => console.log(`  ${b.currency} = ${Number(b.balance).toFixed(2)}`));

  await db.close();
})().catch(e => { console.error(e); process.exit(1); });
