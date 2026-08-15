const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (sql, p=[]) => new Promise((rs,rj)=>db.all(sql,p,(e,r)=>e?rj(e):rs(r)));
const E = (sql, p=[]) => new Promise((rs,rj)=>db.run(sql,p,function(e){e?rj(e):rs({lastID:this.lastID, changes:this.changes});}));

(async () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       PHASE 1 — PURGE ALL MONEY / BALANCES / TXNS            ║');
  console.log('║   (preserves customers, merchants, accounts, cards rows)     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  const steps = [
    ['wallet_transactions',       'DELETE FROM wallet_transactions'],
    ['merchant_wallet_transactions','DELETE FROM merchant_wallet_transactions'],
    ['ledger_entries',            'DELETE FROM ledger_entries'],
    ['crypto_transactions',       'DELETE FROM crypto_transactions'],
    ['wallet_transfers',          'DELETE FROM wallet_transfers'],
    ['bank_payouts',              'DELETE FROM bank_payouts'],
    ['merchant_payouts',          'DELETE FROM merchant_payouts'],
    ['merchant_pos_settlements',  'DELETE FROM merchant_pos_settlements'],
    ['settlement_discrepancies',  'DELETE FROM settlement_discrepancies'],
    ['cashout_transactions',      'DELETE FROM cashout_transactions'],
    ['cashouts',                  'DELETE FROM cashouts'],
    ['offline_funds_receipts',    'DELETE FROM offline_funds_receipts'],
    ['receipts',                  'DELETE FROM receipts'],
    ['pos2013_transactions',      'DELETE FROM pos2013_transactions'],
    ['pos2013_batches',           'DELETE FROM pos2013_batches'],
    ['pos_idempotency',           'DELETE FROM pos_idempotency'],
    ['payment_codes',             'DELETE FROM payment_codes'],
    ['incoming_payments',         'DELETE FROM incoming_payments'],
  ];

  for (const [name, sql] of steps) {
    const r = await E(sql);
    console.log(`   ✓ ${name.padEnd(34)} deleted ${String(r.changes).padStart(5)} rows`);
  }

  // Zero balances on all wallet/account tables (preserve rows)
  const balSteps = [
    ['customer_wallets',         'UPDATE customer_wallets SET balance = 0, currency = COALESCE(NULLIF(currency,""),"USD")'],
    ['customer_crypto_wallets',  'UPDATE customer_crypto_wallets SET balance = 0'],
    ['merchant_wallets',         'UPDATE merchant_wallets SET balance = 0, currency = COALESCE(NULLIF(currency,""),"USD")'],
    ['merchant_crypto_balances', 'UPDATE merchant_crypto_balances SET amount = 0'],
    ['virtual_cards',            'UPDATE virtual_cards SET balance = 0, daily_spent = 0'],
  ];
  console.log('');
  for (const [name, sql] of balSteps) {
    const r = await E(sql);
    console.log(`   ✓ ${name.padEnd(34)} zeroed ${String(r.changes).padStart(5)} rows`);
  }

  // Vacuum the database to reclaim space
  console.log('');
  await E('VACUUM');
  console.log('   ✓ VACUUM complete (space reclaimed)');

  // Quick verification
  console.log('');
  console.log('── POST-CLEANUP VERIFICATION ──');
  const checks = [
    ['customer_wallets (total balance)',    'SELECT COALESCE(SUM(balance),0) v FROM customer_wallets'],
    ['merchant_wallets (total balance)',    'SELECT COALESCE(SUM(balance),0) v FROM merchant_wallets'],
    ['virtual_cards (total balance)',       'SELECT COALESCE(SUM(balance),0) v FROM virtual_cards'],
    ['customer_crypto_wallets (total)',     'SELECT COALESCE(SUM(balance),0) v FROM customer_crypto_wallets'],
    ['wallet_transactions (rows)',          'SELECT COUNT(*) v FROM wallet_transactions'],
    ['ledger_entries (rows)',               'SELECT COUNT(*) v FROM ledger_entries'],
    ['crypto_transactions (rows)',          'SELECT COUNT(*) v FROM crypto_transactions'],
    ['customers (preserved)',               'SELECT COUNT(*) v FROM customers'],
    ['merchant_settings (preserved)',       'SELECT COUNT(*) v FROM merchant_settings'],
    ['bank_accounts (preserved)',           'SELECT COUNT(*) v FROM bank_accounts'],
    ['virtual_cards (preserved)',           'SELECT COUNT(*) v FROM virtual_cards'],
  ];
  for (const [k, sql] of checks) {
    const r = await Q(sql);
    console.log(`   ${k.padEnd(36)} : ${r[0].v}`);
  }

  db.close();
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  PHASE 1 COMPLETE — ALL MOCK/DEMO MONEY PURGED                ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
})().catch(e=>{console.error(e);db.close();process.exit(1);});
