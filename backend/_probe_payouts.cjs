const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/database.sqlite');
const Q = (s, p = []) => new Promise((r, j) => db.all(s, p, (e, x) => e ? j(e) : r(x)));

(async () => {
  for (const tbl of ['merchant_payouts', 'bank_accounts', 'bank_payouts']) {
    try {
      const rows = await Q(`SELECT * FROM ${tbl} ORDER BY created_at DESC LIMIT 10`);
      console.log(`\n=== ${tbl} (${rows.length} rows) ===`);
      rows.forEach(r => console.log(JSON.stringify(r)));
    } catch (e) { console.log(`\n=== ${tbl}: MISSING (${e.message})`); }
  }

  console.log('\n=== SCHEMA for payout tables ===');
  const schemas = await Q("SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('merchant_payouts','bank_accounts','bank_payouts','merchant_pos_settlements','settlements')");
  schemas.forEach(r => console.log(r.name + ':\n' + r.sql + '\n'));

  db.close();
})().catch(e => { console.error(e); db.close(); process.exit(1); });
