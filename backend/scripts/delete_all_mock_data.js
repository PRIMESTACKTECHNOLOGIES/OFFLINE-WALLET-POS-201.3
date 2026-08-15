// Emergency cleanup: DELETE ALL MOCK/TEST/SIM/DATA. Keep ONLY real config tables:
// KEEP: admin_users, terminals, products, bank_accounts, merchant_settings, schema_migrations, users (non-test admin)
// DELETE EVERYTHING else + ZERO merchant AND customer balances.
// This is the user's "NO MOCK DATA" hard reset.
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');
const DB = path.resolve(__dirname, '..', 'data', 'database.sqlite');

(async () => {
  const db = await open({ filename: DB, driver: sqlite3.Database });
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('MOCK DATA CLEANUP START  (deletes ALL txn data, keeps config)');
  console.log('DB: ' + DB);
  console.log('═══════════════════════════════════════════════════════════════════');

  // Lists of what to DELETE entirely (transactional tables, no config here)
  const TRUNCATE = [
    'pos2013_transactions', 'pos2013_batches', 'pos_idempotency',
    'merchant_wallet_transactions', 'merchant_pos_settlements',
    'customer_wallet_transactions', 'customer_wallets',
    'merchant_crypto_balances', 'crypto_transactions', 'crypto_withdrawals',
    'ledger_entries', 'receipts', 'wallet_transfers', 'incoming_payments',
    'cashouts', 'bank_payouts', 'merchant_payouts', 'settlement_discrepancies',
    'offline_funds_receipts', 'payment_codes', 'customers', 'user_sessions',
  ];
  let del=0;
  for (const t of TRUNCATE) {
    try {
      const got = await db.get(`SELECT COUNT(*) AS c FROM ${t}`);
      if (got.c > 0) {
        const info = await db.run(`DELETE FROM ${t}`);
        console.log(`  DELETE ${t.padEnd(32)}  rows=${got.c}  → done.`);
        del += Number(got.c);
      }
    } catch(e) {
      if (!/no such table/i.test(e.message)) {
        console.log(`  SKIP ${t}: ${e.message.split('\n')[0]}`);
      }
    }
  }

  // Zero the merchant wallets (MRC-1001 USD + AED)
  const z1 = await db.run(`UPDATE merchant_wallets SET balance=0, bonus_balance=0, updated_at=CURRENT_TIMESTAMP WHERE merchant_id='MRC-1001'`);
  console.log(`  ZERO merchant_wallets rows updated=${z1.rowCount || 0}  (USD=0 AED=0 now)`);

  // Keep the merchant_wallets rows (they are config). Make sure we have the 2 standard wallets.
  const keep = await db.all('SELECT id, merchant_id, currency, balance FROM merchant_wallets ORDER BY currency');
  console.log('\n[POST-CLEANUP Keeper merchant_wallets rows]:');
  keep.forEach(k => console.log(`  merchant=${k.merchant_id}  cur=${k.currency}  bal=$${Number(k.balance).toFixed(2)}`));

  // Keep the 3 seed migration ledger entries ONLY if they exist (we deleted the table - reinsert seed rows)
  try {
    const seed3 = [
      ['seed-merchant-wallet-init', 'merchant_wallet_init', 0, 'USD', 'system.operator.usd', 'merchant.MRC-1001.usd', 'Initial operator USD float seed ledger (zero balance)'],
      ['seed-merchant-wallet-init-aed', 'merchant_wallet_init', 0, 'AED', 'system.operator.aed', 'merchant.MRC-1001.aed', 'Initial operator AED float seed ledger (zero balance)'],
      ['seed-treasury-usdt-hot', 'treasury_seed', 0, 'USDT', 'system.treasury.usdt.cold', 'system.treasury.usdt.hot', 'Initial USDT treasury seed ledger (zero balance)'],
    ];
    for (const r of seed3) {
      await db.run(`INSERT OR IGNORE INTO ledger_entries (id, transaction_id, type, amount, currency, debit_account, credit_account, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, r);
    }
    console.log(`  Reinserted 3 seed ledger_entries rows (non-mock, keep).`);
  } catch(e) { console.log(`  ledger seed insert: SKIP: ${e.message.split('\n')[0]}`); }

  // Show final counts
  const final = {};
  for (const t of ['customers','customer_wallets','customer_wallet_transactions','merchant_wallet_transactions','merchant_pos_settlements','pos2013_transactions','pos2013_batches','pos_idempotency','merchant_crypto_balances','crypto_transactions','ledger_entries']) {
    try { const r = await db.get(`SELECT COUNT(*) AS c FROM ${t}`); final[t] = r.c; } catch(e){}
  }
  const wallets = await db.all('SELECT currency, balance FROM merchant_wallets WHERE merchant_id=?', ['MRC-1001']);
  const merch_total = wallets.reduce((s,w)=>s+Number(w.balance),0);
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('[CLEANUP COMPLETE] Final counts (all transactional tables = 0 except seed ledger = 3)');
  Object.keys(final).forEach(k => console.log(`  ${k.padEnd(32)} = ${final[k]}`));
  console.log(`  Merchant MRC-1001 total balances = $${merch_total.toFixed(2)}  (SHOULD BE $0.00)`);
  wallets.forEach(w => console.log(`    → ${w.currency}: $${Number(w.balance).toFixed(2)}`));
  const keepers = {};
  for (const t of ['admin_users','terminals','products','merchant_settings','bank_accounts','merchant_wallets','users']) {
    try { const r = await db.get(`SELECT COUNT(*) AS c FROM ${t}`); keepers[t] = r.c; } catch(e){}
  }
  console.log('\n[CONFIG KEEPER COUNTS]:');
  Object.keys(keepers).forEach(k=>console.log(`  ${k.padEnd(24)} = ${keepers[k]}`));
  console.log('═══════════════════════════════════════════════════════════════════');
  await db.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
