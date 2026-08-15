// cleanup_cvv999_and_redo.js: rollback Path B v5 test CVV=999
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const DB = path.resolve(__dirname, "..", "data", "database.sqlite");
(async () => {
  const db = await open({ filename: DB, driver: sqlite3.Database });
  // merchant_wallets USD back to 0
  const wUpd = await db.run(`UPDATE merchant_wallets SET balance=0, updated_at=CURRENT_TIMESTAMP WHERE currency IN ('USD','AED','USDT')`);
  console.log(`Zeroed merchant_wallets: ${wUpd.changes || 0} rows`);
  // tx tables truncation (only tx rows, preserve customers/terminals/users/operator)
  for (const t of [
    'receipts',
    'pos2013_transactions',
    'pos_idempotency',
    'merchant_wallet_transactions',
    'merchant_pos_settlements',
    'wallet_transfers',
    'incoming_payments',
    'cashouts',
    'bank_payouts',
    'merchant_payouts',
    'settlement_discrepancies',
    'payment_codes',
    'offline_funds_receipts',
    'crypto_balances',
    'crypto_transactions',
    'user_sessions',
  ]) {
    try { const r = await db.run(`DELETE FROM ${t}`); console.log(`  DELETE ${t}: ${r.changes || 0} rows`); } catch(e) { console.log(`  SKIP ${t}: ${e.message}`); }
  }
  // Ledger: keep seed (id LIKE 'seed-*'), delete others
  const lgDel = await db.run(`DELETE FROM ledger_entries WHERE id NOT LIKE 'seed-%' AND id NOT LIKE 'seed_%'`);
  console.log(`  DELETE ledger non-seed entries: ${lgDel.changes || 0} rows`);
  // customer wallets: leave as is (customer still registered)
  await db.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
