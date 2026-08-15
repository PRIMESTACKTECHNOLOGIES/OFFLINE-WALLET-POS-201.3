const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

function openDb(dbPath) {
  return {
    db: new sqlite3.Database(dbPath),
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes, lastID: this.lastID });
        });
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    },
    close() { this.db.close(); }
  };
}

async function testDb(label, dbPath) {
  const exists = fs.existsSync(dbPath);
  console.log('');
  console.log('═══ Testing:', label, '═══');
  console.log('Path:', dbPath);
  console.log('Exists:', exists);
  if (!exists) { console.log('  SKIP — file does not exist'); return; }

  const dbo = openDb(dbPath);
  try {
    const tables = await dbo.all("SELECT name FROM sqlite_master WHERE type='table' AND name='customers'");
    if (!tables.length) { console.log('  SKIP — no customers table'); return; }

    const countBefore = await dbo.all('SELECT COUNT(*) AS c FROM customers');
    console.log('  Customers before:', countBefore[0].c);

    const id = uuidv4();
    const testName = 'E2E_TEST_NAME_' + Date.now();
    console.log('  Inserting with name:', testName);
    await dbo.run(
      'INSERT INTO customers (id, name, email, phone) VALUES (?, ?, ?, ?)',
      [id, testName, 'test@e2e.com', '555-0123']
    );

    const walletId = uuidv4();
    const walletCode = 'PSW-' + Math.floor(Math.random()*9000+1000) + '-' + Math.floor(Math.random()*9000+1000);
    await dbo.run(
      'INSERT INTO customer_wallets (id, customer_id, balance, currency, wallet_code) VALUES (?, ?, 0, ?, ?)',
      [walletId, id, 'USD', walletCode]
    );

    const cust = await dbo.all('SELECT * FROM customers WHERE id = ?', [id]);
    console.log('  SELECT * result:', JSON.stringify(cust[0], null, 4));
    console.log('  Name field MATCHES:', cust[0]?.name === testName);
    console.log('  Name is NULL/undefined:', cust[0]?.name == null);

    const joined = await dbo.all(`
      SELECT c.*, w.id AS wallet_id, w.wallet_code, w.balance AS wallet_balance
      FROM customers c LEFT JOIN customer_wallets w ON w.customer_id = c.id
      WHERE c.id = ?
    `, [id]);
    console.log('  JOIN getCustomers() result:', JSON.stringify(joined[0], null, 4));
    console.log('  Name in JOIN MATCHES:', joined[0]?.name === testName);

    await dbo.run('DELETE FROM customer_wallets WHERE id = ?', [walletId]);
    await dbo.run('DELETE FROM customers WHERE id = ?', [id]);
    console.log('  Cleanup complete');
  } finally { dbo.close(); }
}

(async () => {
  const correctDb = path.join(__dirname, 'data', 'database.sqlite');
  const wrongDb = 'F:\\data\\database.sqlite';

  await testDb('CORRECT DB (backend/data/database.sqlite)', correctDb);
  await testDb('WRONG DB (F:\\data\\database.sqlite)', wrongDb);

  console.log('');
  console.log('═══ FINAL VERIFICATION: Current customer names in correct DB');
  const dbo = openDb(correctDb);
  const custs = await dbo.all('SELECT id, name FROM customers ORDER BY datetime(created_at) DESC LIMIT 5');
  custs.forEach(c => console.log('  ', c.id.slice(0,8)+'…', '→', JSON.stringify(c.name)));
  const nullNames = custs.filter(c => !c.name);
  console.log('  NULL/empty names in last 5:', nullNames.length);
  const allCusts = await dbo.all('SELECT id, name FROM customers');
  const allNulls = allCusts.filter(c => !c.name);
  console.log('  Total customers with NULL/empty name:', allNulls.length, '/', allCusts.length);
  if (allNulls.length) {
    console.log('  ⚠️  Problem customers:', allNulls.map(c => c.id.slice(0,8) + '… name=' + JSON.stringify(c.name)));
  }
  dbo.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
