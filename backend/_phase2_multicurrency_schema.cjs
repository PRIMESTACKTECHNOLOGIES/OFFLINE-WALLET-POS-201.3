const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (sql, p=[]) => new Promise((rs,rj)=>db.all(sql,p,(e,r)=>e?rj(e):rs(r)));
const E = (sql, p=[]) => new Promise((rs,rj)=>db.run(sql,p,function(e){e?rj(e):rs({lastID:this.lastID, changes:this.changes});}));

(async () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║    PHASE 2 — MULTI-CURRENCY SCHEMA MIGRATION                 ║');
  console.log('║  • wallet_transactions add currency column                    ║');
  console.log('║  • merchant_wallet_transactions add currency column           ║');
  console.log('║  • customer_wallets: UNIQUE(customer_id) → (customer_id,ccy) ║');
  console.log('║  • merchant_wallets: UNIQUE(merchant_id) → (merchant_id,ccy) ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  // ── Step 1: add currency column to txn tables ────────────────────────
  const addColSteps = [
    ['wallet_transactions',         `ALTER TABLE wallet_transactions ADD COLUMN currency TEXT DEFAULT 'USD'`],
    ['merchant_wallet_transactions',`ALTER TABLE merchant_wallet_transactions ADD COLUMN currency TEXT DEFAULT 'USD'`],
    ['customer_wallets',            `ALTER TABLE customer_wallets ADD COLUMN wallet_code_x TEXT`], // placeholder (no-op failsafe)
  ];
  for (const [tbl, sql] of addColSteps) {
    try {
      const r = await E(sql);
      console.log(`   ✓ ${tbl.padEnd(32)}: column added (ok if already existed)`);
    } catch (e) {
      if (/duplicate column name/i.test(e.message)) {
        console.log(`   ℹ ${tbl.padEnd(32)}: column already exists — safe`);
      } else {
        throw e;
      }
    }
  }
  // Drop the placeholder col if it was created (we just needed to test ALTER flow)
  try { await E(`ALTER TABLE customer_wallets DROP COLUMN wallet_code_x`); } catch(_) {}
  console.log('');

  // ── Step 2: Rebuild customer_wallets with multi-currency PK ──────────
  // SQLite doesn't support ALTER COLUMN or DROP CONSTRAINT. Must rebuild table.
  console.log('   Rebuilding customer_wallets (UNIQUE per (customer_id, currency))...');
  await E(`CREATE TABLE IF NOT EXISTS customer_wallets_v2 (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0.00,
    currency TEXT DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'active',
    wallet_code TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (customer_id, currency)
  )`);
  const existingCW = await Q(`SELECT id, customer_id, balance, COALESCE(currency,'USD') AS currency,
    COALESCE(status,'active') AS status, wallet_code, created_at, updated_at FROM customer_wallets`);
  for (const r of existingCW) {
    await E(`INSERT OR IGNORE INTO customer_wallets_v2
      (id, customer_id, balance, currency, status, wallet_code, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?)`,
      [r.id, r.customer_id, r.balance, r.currency, r.status, r.wallet_code, r.created_at, r.updated_at]);
  }
  await E(`DROP TABLE customer_wallets`);
  await E(`ALTER TABLE customer_wallets_v2 RENAME TO customer_wallets`);
  console.log(`   ✓ customer_wallets rebuilt  (${existingCW.length} rows preserved)`);

  // ── Step 3: Rebuild merchant_wallets with multi-currency PK ──────────
  console.log('   Rebuilding merchant_wallets (UNIQUE per (merchant_id, currency))...');
  await E(`CREATE TABLE IF NOT EXISTS merchant_wallets_v2 (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0.00,
    currency TEXT DEFAULT 'USD',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (merchant_id, currency)
  )`);
  const existingMW = await Q(`SELECT id, merchant_id, balance, COALESCE(currency,'USD') AS currency,
    created_at, updated_at FROM merchant_wallets`);
  for (const r of existingMW) {
    await E(`INSERT OR IGNORE INTO merchant_wallets_v2
      (id, merchant_id, balance, currency, created_at, updated_at)
      VALUES (?,?,?,?,?,?)`,
      [r.id, r.merchant_id, r.balance, r.currency, r.created_at, r.updated_at]);
  }
  await E(`DROP TABLE merchant_wallets`);
  await E(`ALTER TABLE merchant_wallets_v2 RENAME TO merchant_wallets`);
  console.log(`   ✓ merchant_wallets rebuilt  (${existingMW.length} rows preserved)`);

  // ── Step 4: Backfill currency='USD' on any existing txn rows that have NULL ──
  const backfillSteps = [
    "UPDATE wallet_transactions SET currency = 'USD' WHERE currency IS NULL OR currency = ''",
    "UPDATE merchant_wallet_transactions SET currency = 'USD' WHERE currency IS NULL OR currency = ''",
  ];
  console.log('');
  for (const sql of backfillSteps) {
    const r = await E(sql);
    if (r.changes > 0) console.log(`   ✓ backfilled ${r.changes} rows with default USD`);
  }

  // ── Step 5: Verify schema changes ────────────────────────────────────
  console.log('');
  console.log('── SCHEMA VERIFICATION ──');
  const schemaChecks = [
    ['wallet_transactions has currency?',
      `SELECT COUNT(*) AS c FROM pragma_table_info('wallet_transactions') WHERE name='currency'`],
    ['merchant_wallet_transactions has currency?',
      `SELECT COUNT(*) AS c FROM pragma_table_info('merchant_wallet_transactions') WHERE name='currency'`],
  ];
  for (const [k, sql] of schemaChecks) {
    const r = await Q(sql);
    console.log(`   ${k.padEnd(44)}: ${r[0].c>0?'YES ✓':'NO ❌'}`);
  }

  // Indexes for speed on (customer_id, currency) lookups
  console.log('');
  try {
    await E(`CREATE INDEX IF NOT EXISTS idx_cw_customer_ccy ON customer_wallets(customer_id, currency)`);
    await E(`CREATE INDEX IF NOT EXISTS idx_mw_merchant_ccy ON merchant_wallets(merchant_id, currency)`);
    console.log('   ✓ Indexes created on (customer/merchant, currency)');
  } catch(e) { console.log('   ℹ indexes existed'); }

  await E('VACUUM');
  console.log('   ✓ VACUUM complete');

  db.close();
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  PHASE 2 COMPLETE — DB NOW SUPPORTS AED + USD NATIVE STORE   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
})().catch(e=>{console.error(e);db.close();process.exit(1);});
