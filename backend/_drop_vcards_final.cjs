const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const root = __dirname;
const DB = path.join(root, 'data', 'database.sqlite');
console.log('Using DB path (matches backend/db_sqlite.ts default):', DB);
const db = new sqlite3.Database(DB);
const Q = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (e, r) => e ? reject(e) : resolve(r)));
const RUN = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); }));
(async () => {
  const probeBefore = await Q(`SELECT name FROM sqlite_master WHERE type='table' AND name='virtual_cards'`);
  console.log('\nBefore drop — virtual_cards table exists?', probeBefore.length ? 'YES' : 'NO');
  if (probeBefore.length === 0) { console.log('Already dropped. Done.'); db.close(); return; }
  const sum = (await Q(`SELECT COALESCE(SUM(balance),0) s FROM virtual_cards`))[0].s;
  const count = (await Q(`SELECT COUNT(*) c FROM virtual_cards`))[0].c;
  console.log(`  Rows: ${count}  |  Total balance: $${Number(sum).toFixed(4)}`);
  if (Number(sum) > 0.0001) {
    console.log('❌ REFUSING TO DROP — trapped balance still present. Rows with balance>0:');
    const bad = await Q(`SELECT id, customer_id, balance, currency FROM virtual_cards WHERE balance>0.0001`);
    bad.forEach(r => console.log('  ', JSON.stringify(r)));
    db.close(); process.exit(1);
  }
  await RUN(`DELETE FROM virtual_cards`);
  await RUN(`DROP TABLE IF EXISTS virtual_cards`);
  const probeAfter = await Q(`SELECT name FROM sqlite_master WHERE type='table' AND name='virtual_cards'`);
  console.log('\nAfter drop — virtual_cards table exists?', probeAfter.length ? 'YES (FAIL)' : 'NO (correct)  ✅');
  const w = (await Q(`SELECT balance, wallet_code FROM customer_wallets WHERE customer_id='1e109c8a-ff9a-4950-b94f-337ba3b3d650' AND currency='USD'`))[0];
  console.log(`MR.HARRIS USD wallet PSW-7299-5036 balance = $${Number(w?.balance ?? 0).toFixed(2)}`);
  db.close();
})().catch(e => { console.error(e); try { db.close(); } catch(_){} process.exit(1); });
