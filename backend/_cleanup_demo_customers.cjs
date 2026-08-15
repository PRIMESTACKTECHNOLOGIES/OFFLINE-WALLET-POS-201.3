const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const DB_PATH = path.join("F:\\POS OFFLINE SFTWR\\backend\\data\\database.sqlite");

const DEMO_NAMES = new Set([
  "Sarah Johnson", "Ahmed Al-Mansoori", "Maria Garcia Lopez", "James Wilson III", "Priya Sharma",
  "Demo User - Alex Carter", "Test Customer API", "PROBE_TEST_NOW", "TEST_SAVE_CHECK", "LIVE TEST",
  "asjhdjahvcb", "Test Customer", "adsgr", "z cx c", "cryptocard shop",
]);

// Wrapped delete — ignores missing tables
async function safeRun(db, sql, params) {
  try { return await db.run(sql, params); } catch (e) { return { changes: 0 }; }
}

(async () => {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.run("PRAGMA foreign_keys = ON");

  const all = await db.all("SELECT id, name FROM customers");
  const toDelete = all.filter(c => DEMO_NAMES.has(c.name));
  console.log(`Found ${all.length} total customers. Deleting ${toDelete.length} demo customers...`);

  for (const c of toDelete) {
    const cid = c.id;
    await safeRun(db, `DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM customer_wallets WHERE customer_id = ?)`, [cid]);
    await safeRun(db, `DELETE FROM crypto_transactions WHERE customer_id = ?`, [cid]);
    // Try common crypto balance table names
    await safeRun(db, `DELETE FROM crypto_balances WHERE customer_id = ?`, [cid]);
    await safeRun(db, `DELETE FROM customer_crypto_balances WHERE customer_id = ?`, [cid]);
    await safeRun(db, `DELETE FROM bank_accounts WHERE customer_id = ?`, [cid]);
    await safeRun(db, `DELETE FROM virtual_cards WHERE customer_id = ?`, [cid]);
    await safeRun(db, `DELETE FROM bank_payouts WHERE customer_id = ?`, [cid]);
    await safeRun(db, `DELETE FROM customer_wallets WHERE customer_id = ?`, [cid]);
    const r = await db.run(`DELETE FROM customers WHERE id = ?`, [cid]);
    console.log(`  DELETED: ${c.name} (${r.changes} row)`);
  }

  try { await db.run("VACUUM"); } catch(_) {}

  const remaining = await db.all("SELECT id, name, email, phone FROM customers ORDER BY name");
  console.log("\n=================================");
  console.log(`REMAINING CUSTOMERS (${remaining.length}):`);
  console.log("=================================");
  remaining.forEach((c, i) => console.log(`  [${i+1}] ${(c.name||"(NULL)").padEnd(26)} | ${c.email || "—"} | ${c.phone || "—"}`));
  await db.close();
  console.log("\nCleanup done. Demo customers wiped successfully.");
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
