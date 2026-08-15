const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
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

const MIGRATIONS = [
  `ALTER TABLE bank_accounts ADD COLUMN merchant_id TEXT`,
  `ALTER TABLE bank_accounts ADD COLUMN account_type TEXT DEFAULT 'CHECKING'`,
  `ALTER TABLE bank_accounts ADD COLUMN bank_address TEXT`,
  `ALTER TABLE bank_payouts ADD COLUMN provider_ref TEXT`,
  `ALTER TABLE bank_payouts ADD COLUMN provider TEXT`,
  `ALTER TABLE bank_payouts ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP`,
];

(async () => {
  console.log('Running migrations on', DB_PATH);

  // ── 1. Run ALTER migrations (safe, ignore "duplicate column" errors) ──
  for (const sql of MIGRATIONS) {
    try {
      await execSql(sql);
      console.log('  OK  ', sql.slice(0, 80));
    } catch (e) {
      if (/duplicate column name|no such table|already exists/i.test(e.message)) {
        console.log('  SKIP', sql.slice(0, 80), '—', e.message);
      } else {
        console.error('  FAIL', sql, e.message);
        process.exit(1);
      }
    }
  }

  // ── 2. Create merchant_payouts table (idempotent via CREATE IF NOT EXISTS) ──
  try {
    await execSql(`
      CREATE TABLE IF NOT EXISTS merchant_payouts (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        bank_account TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        provider TEXT,
        provider_reference TEXT,
        meta TEXT,
        error_message TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  OK  merchant_payouts table');
  } catch (e) {
    console.error('merchant_payouts create FAIL', e.message);
    process.exit(1);
  }

  // ── 3. Seed PRIMESTACK TECHNOLOGIES LLC bank accounts for MRC-1001 ──
  //          Idempotency: upsert by (merchant_id, currency, account_holder)
  const PRIMESTACK_ACCOUNTS = [
    // — USD / ACH (Colum Bank / Wise US) — is_default for merchant —
    {
      id: 'ba-primestack-usd-001',
      merchant_id: 'MRC-1001',
      bank_name: 'Wise US Inc (partner: Column Bank)',
      account_holder: 'PRIMESTACK TECHNOLOGIES LLC',
      account_number: '343612919064346',
      routing_number: '084009519',
      account_type: 'DEPOSIT',
      iban: null,
      swift_code: 'TRWIUS35XXX',
      bank_address: 'Wise US Inc, 108 W 13th St, Wilmington, DE, 19801, United States',
      currency: 'USD',
      is_default: 1,
      verified: 1,
    },
    // — EUR / SEPA (Belgium Wise) —
    {
      id: 'ba-primestack-eur-001',
      merchant_id: 'MRC-1001',
      bank_name: 'Wise',
      account_holder: 'PRIMESTACK TECHNOLOGIES LLC',
      account_number: '905861593312',
      routing_number: null,
      account_type: 'CHECKING',
      iban: 'BE19 9058 6159 3312',
      swift_code: 'TRWIBEB1XXX',
      bank_address: 'Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium',
      currency: 'EUR',
      is_default: 0,
      verified: 1,
    },
    // — AED-capable (UK Wise IBAN, receives AED + other currencies via SWIFT) —
    {
      id: 'ba-primestack-gbp-aed-001',
      merchant_id: 'MRC-1001',
      bank_name: 'Wise Payments Limited',
      account_holder: 'PRIMESTACK TECHNOLOGIES LLC',
      account_number: '82676861',
      routing_number: '608464',
      account_type: 'CHECKING',
      iban: 'GB64 TRWI 6084 6482 6768 61',
      swift_code: 'TRWIGB2LXXX',
      bank_address: 'Worship Square, 65 Clifton Street, London, EC2A 4JE, United Kingdom',
      currency: 'GBP',
      is_default: 0,
      verified: 1,
    },
  ];

  let inserted = 0, updated = 0;
  for (const acc of PRIMESTACK_ACCOUNTS) {
    const existing = await query(
      `SELECT id FROM bank_accounts WHERE merchant_id = ? AND currency = ? AND account_holder = ? LIMIT 1`,
      [acc.merchant_id, acc.currency, acc.account_holder]
    );

    if (existing.length === 0) {
      await execSql(
        `INSERT INTO bank_accounts
           (id, merchant_id, bank_name, account_holder, account_number, routing_number,
            account_type, iban, swift_code, bank_address, currency, is_default, verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          acc.id, acc.merchant_id, acc.bank_name, acc.account_holder,
          acc.account_number, acc.routing_number, acc.account_type,
          acc.iban, acc.swift_code, acc.bank_address, acc.currency,
          acc.is_default, acc.verified,
        ]
      );
      inserted++;
      console.log(`  INSERT ${acc.id}  (${acc.currency})  default=${acc.is_default}`);
    } else {
      await execSql(
        `UPDATE bank_accounts SET
           bank_name = ?, account_holder = ?, account_number = ?, routing_number = ?,
           account_type = ?, iban = ?, swift_code = ?, bank_address = ?,
           is_default = ?, verified = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          acc.bank_name, acc.account_holder, acc.account_number, acc.routing_number,
          acc.account_type, acc.iban, acc.swift_code, acc.bank_address,
          acc.is_default, acc.verified, existing[0].id,
        ]
      );
      updated++;
      console.log(`  UPDATE ${existing[0].id}  (${acc.currency})`);
    }
  }
  console.log(`\nPRIMESTACK seed: ${inserted} inserted, ${updated} updated for MRC-1001`);

  // ── 4. Report back what's in DB now ──
  console.log('\n=== Final bank_accounts for MRC-1001 ===');
  (await query(`SELECT id, merchant_id, customer_id, bank_name, account_holder, account_number,
                       routing_number, account_type, iban, swift_code, currency, is_default, verified
                FROM bank_accounts WHERE merchant_id = 'MRC-1001' ORDER BY is_default DESC, currency ASC`))
    .forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== merchant_payouts table exists? columns: ===');
  (await query(`PRAGMA table_info(merchant_payouts)`)).forEach(r => console.log('  •', r.name, r.type));

  console.log('\nDone.');
  db.close();
})().catch(e => { console.error('\nFATAL', e); db.close(); process.exit(1); });
