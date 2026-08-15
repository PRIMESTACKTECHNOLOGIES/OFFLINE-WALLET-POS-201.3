const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/database.sqlite');
const Q = (s, p = []) => new Promise((r, j) => db.all(s, p, (e, x) => e ? j(e) : r(x)));

(async () => {
  console.log('--- FULL LEDGER ENTRIES ---');
  (await Q('SELECT * FROM ledger_entries ORDER BY created_at DESC')).forEach(r => console.log(JSON.stringify(r, null, 2)));

  console.log('\n--- FULL MERCHANT WALLETS + TX ---');
  (await Q('SELECT * FROM merchant_wallets ORDER BY updated_at DESC')).forEach(r => console.log(JSON.stringify(r, null, 2)));
  (await Q('SELECT * FROM merchant_wallet_transactions ORDER BY created_at DESC')).forEach(r => console.log(JSON.stringify(r, null, 2)));

  for (const tbl of ['pos_transactions', 'offline_batches', 'bank_payouts', 'batches', 'cashouts', 'settlements']) {
    try {
      const rows = await Q(`SELECT * FROM ${tbl} ORDER BY created_at DESC LIMIT 10`);
      console.log(`\n--- ${tbl} (${rows.length} rows, last 10) ---`);
      rows.forEach(r => console.log(JSON.stringify(r, null, 2)));
    } catch (e) { console.log(`\n--- ${tbl}: MISSING (${e.message})`); }
  }

  console.log('\n--- ALL TABLES ---');
  (await Q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).forEach(r => console.log(' •', r.name));

  db.close();
})().catch(e => { console.error(e); db.close(); process.exit(1); });
