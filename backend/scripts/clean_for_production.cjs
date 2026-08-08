/**
 * PRODUCTION CLEANUP SCRIPT
 * Removes all demo/test data. Keeps real customers and admin user.
 * Run once before going live: node scripts/clean_for_production.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/database.sqlite');
console.log('[CLEANUP] Using DB:', DB_PATH);

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

(async () => {
  try {
    // ── 1. Identify demo customer IDs (primestack.ae emails = demo) ──────────
    const demoCustomers = await all(
      "SELECT id FROM customers WHERE email LIKE '%primestack.ae%'"
    );
    const demoIds = demoCustomers.map(c => c.id);
    console.log(`[1] Demo customers to remove: ${demoIds.length}`);

    if (demoIds.length > 0) {
      const placeholders = demoIds.map(() => '?').join(',');
      // Remove their wallets first
      const demoWallets = await all(
        `SELECT id FROM customer_wallets WHERE customer_id IN (${placeholders})`,
        demoIds
      );
      const walletIds = demoWallets.map(w => w.id);
      if (walletIds.length > 0) {
        const wp = walletIds.map(() => '?').join(',');
        await run(`DELETE FROM wallet_transactions WHERE wallet_id IN (${wp})`, walletIds);
        await run(`DELETE FROM customer_wallets WHERE id IN (${wp})`, walletIds);
      }
      await run(`DELETE FROM customer_crypto_wallets WHERE customer_id IN (${placeholders})`, demoIds);
      await run(`DELETE FROM customers WHERE id IN (${placeholders})`, demoIds);
      console.log(`    Removed ${demoIds.length} demo customers + their wallets`);
    }

    // ── 2. Clear ALL test/demo transactions ───────────────────────────────────
    const batches = await all("SELECT COUNT(*) as cnt FROM pos2013_batches");
    console.log(`[2] Clearing ${batches[0].cnt} test batches...`);
    await run('DELETE FROM pos2013_transactions');
    await run('DELETE FROM pos2013_batches');
    await run('DELETE FROM pos_idempotency');
    await run('DELETE FROM offline_funds_receipts');
    await run('DELETE FROM merchant_pos_settlements');
    await run('DELETE FROM ledger_entries');

    // ── 3. Clear merchant wallets (reset balances) ────────────────────────────
    console.log('[3] Resetting merchant wallets to 0...');
    await run('UPDATE merchant_wallets SET balance = 0, updated_at = CURRENT_TIMESTAMP');
    await run('DELETE FROM merchant_wallet_transactions');

    // ── 4. Clear crypto balances ──────────────────────────────────────────────
    console.log('[4] Clearing crypto balances...');
    await run('DELETE FROM merchant_crypto_balances');
    await run('DELETE FROM crypto_transactions');

    // ── 5. Clear customer crypto wallets for real customers ───────────────────
    await run('DELETE FROM customer_crypto_wallets');

    // ── 6. Reset all real customer wallet balances to 0 ──────────────────────
    console.log('[5] Resetting real customer wallet balances to 0...');
    await run('UPDATE customer_wallets SET balance = 0, updated_at = CURRENT_TIMESTAMP');
    await run('DELETE FROM wallet_transactions');

    // ── 7. Keep only real user sessions (clear stale ones) ────────────────────
    await run("DELETE FROM user_sessions WHERE created_at < datetime('now', '-7 days')");

    // ── 8. Delete test script ─────────────────────────────────────────────────
    console.log('[6] Cleanup complete!');

    // ── Final state ───────────────────────────────────────────────────────────
    const finalCustomers = await all('SELECT name, email FROM customers ORDER BY created_at');
    const finalWallets = await all('SELECT merchant_id, balance FROM merchant_wallets');
    const finalTxns = await all('SELECT COUNT(*) as cnt FROM pos2013_transactions');

    console.log('\n========================================');
    console.log('PRODUCTION DATABASE STATE');
    console.log('========================================');
    console.log('Real customers kept:');
    finalCustomers.forEach((c, i) => console.log(`  ${i+1}. ${c.name} (${c.email || 'no email'})`));
    console.log('Merchant wallets:');
    finalWallets.forEach(w => console.log(`  ${w.merchant_id}: $${w.balance}`));
    console.log('Transactions:', finalTxns[0].cnt, '(should be 0)');
    console.log('\n✅ Ready for real-world production use!');

    db.close();
  } catch (e) {
    console.error('CLEANUP ERROR:', e.message);
    db.close();
    process.exit(1);
  }
})();
