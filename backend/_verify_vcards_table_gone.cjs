const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const envPath = path.resolve(__dirname, '.env');
try { require('dotenv').config({ path: envPath }); } catch {}
const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(dbPath);
function Q(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, r) => e ? reject(e) : resolve(r)));
}
(async () => {
  console.log('DB path:', dbPath);
  const schema = await Q(`SELECT name FROM sqlite_master WHERE type='table' AND name='virtual_cards'`);
  console.log('\nsqlite_master virtual_cards rows:', JSON.stringify(schema));
  if (schema.length === 0) console.log('\n✅ CONFIRMED: virtual_cards TABLE DOES NOT EXIST');
  else console.log('\n❌ virtual_cards still exists:', schema);
  try {
    const r = await Q(`SELECT COUNT(*) AS c FROM virtual_cards`);
    console.log('❌ Count query succeeded:', r);
  } catch (e) {
    console.log('✅ SELECT FROM virtual_cards correctly throws:', e.message.slice(0, 120));
  }
  const tables = (await Q(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)).map(r => r.name);
  console.log('\nRemaining tables:', tables.join(', '));
  db.close();
})();
