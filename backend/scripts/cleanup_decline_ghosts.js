// cleanup_decline_ghosts.js
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const DB = path.resolve(__dirname, "..", "data", "database.sqlite");
(async () => {
  const db = await open({ filename: DB, driver: sqlite3.Database });
  const idemDel = await db.run(`DELETE FROM pos_idempotency WHERE result_json LIKE '%DECLINED%'`);
  console.log(`deleted ${idemDel.changes || 0} DECLINE rows from pos_idempotency`);
  // Any pos2013_transactions rows with status DECLINED / stan 000011
  const pDel = await db.run(`DELETE FROM pos2013_transactions WHERE status='DECLINED' OR stan IN ('000010','000011')`);
  console.log(`deleted ${pDel.changes || 0} declined pos2013_transactions rows`);
  // ledger entries with description like 'Offline floor-limit approved' AND (amount ABS > 6000 USD (cents bug)) OR ledger id contains timestamp == just created 30 minutes ago after 2026 etc. Anything > 5500$ amount
  const lgDel = await db.run(`DELETE FROM ledger_entries WHERE description LIKE '%floor-limit approved%' AND ABS(amount) > 5500`);
  console.log(`deleted ${lgDel.changes || 0} amount>5500 ghost ledger rows`);
  // Also delete any remaining ledger auth entries > 10000 USD
  const lgDel2 = await db.run(`DELETE FROM ledger_entries WHERE status='AUTHORIZED' AND ABS(amount) >= 5500`);
  console.log(`deleted ${lgDel2.changes || 0} ledger_rows that had cents->dollars bug`);
  // Also delete any ledger_entries that reference customer IDs we have
  const lDelOld = await db.run(`DELETE FROM ledger_entries WHERE id LIKE 'ledger_17866894%'`);
  console.log(`deleted ${lDelOld.changes || 0} old ledger rows`);
  // Delete any merchant_pos_settlements rows of 0 or weird
  const sDel = await db.run(`DELETE FROM merchant_pos_settlements WHERE ABS(amount) >= 5500 OR amount <= 0`);
  console.log(`deleted ${sDel.changes || 0} bad settlement rows`);
  await db.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
