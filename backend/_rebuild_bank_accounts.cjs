const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

const execSql = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve({ changes: this.changes, lastID: this.lastID });
  });
});
const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

(async () => {
  console.log('Rebuilding bank_accounts table to allow NULL customer_id for merchant-owned accounts…');

  // SQLite can't ALTER COLUMN — we do the canonical 4-step rebuild.
  // Foreign-key pragma off during rebuild, re-on afterwards.
  await execSql('PRAGMA foreign_keys = OFF');
  try {
    // 1. Create replacement table with customer_id nullable + new columns
    await execSql(`
      CREATE TABLE IF NOT EXISTS bank_accounts_new (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        merchant_id TEXT,
        bank_name TEXT NOT NULL,
        account_holder TEXT NOT NULL,
        account_number TEXT NOT NULL,
        routing_number TEXT,
        account_type TEXT DEFAULT 'CHECKING',
        iban TEXT,
        swift_code TEXT,
        bank_address TEXT,
        currency TEXT DEFAULT 'USD',
        is_default INTEGER DEFAULT 0,
        verified INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  + temp table bank_accounts_new');

    // 2. Copy existing rows (older schema: no merchant_id/account_type/bank_address cols)
    //    Use explicit col list so source column count matches destination
    const hasCol = async (tbl, col) => {
      const rows = await query(`PRAGMA table_info(${tbl})`);
      return rows.some(r => r.name === col);
    };
    const cols = [];
    for (const c of ['id','customer_id','bank_name','account_holder','account_number','routing_number','iban','swift_code','currency','is_default','verified','created_at']) {
      if (await hasCol('bank_accounts', c)) cols.push(c);
    }
    // Fill merchant_id=NULL, account_type=CHECKING, bank_address=NULL during copy
    const sqlCopy = `
      INSERT INTO bank_accounts_new
        (${cols.join(',')}, merchant_id, account_type, bank_address)
      SELECT ${cols.join(',')}, NULL, 'CHECKING', NULL FROM bank_accounts
    `;
    await execSql(sqlCopy);
    console.log('  + data copied');

    // 3. Drop old table
    await execSql('DROP TABLE bank_accounts');
    console.log('  + old table dropped');

    // 4. Rename new to canonical name
    await execSql('ALTER TABLE bank_accounts_new RENAME TO bank_accounts');
    console.log('  + new table renamed to bank_accounts');

  } finally {
    await execSql('PRAGMA foreign_keys = ON');
  }

  // Sanity: schema now
  console.log('\nbank_accounts columns after rebuild:');
  (await query('PRAGMA table_info(bank_accounts)'))
    .forEach(r => console.log('  •', r.name.padEnd(20), r.type, r.notnull ? 'NOT NULL' : ''));

  db.close();
  console.log('\nRebuild OK — now run the seed script again.');
})().catch(e => { console.error('\nFATAL', e); db.close(); process.exit(1); });
