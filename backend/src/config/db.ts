// Load .env FIRST — db.ts constructor runs at import time, before server.ts dotenv.config()
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import Database from 'better-sqlite3';

// Always resolve DB path relative to the backend root (where .env lives)
// __dirname is backend/src/config — go up 2 levels to backend/
const BACKEND_ROOT = path.join(__dirname, '../..');
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(BACKEND_ROOT, process.env.DATABASE_PATH)
  : path.join(BACKEND_ROOT, 'data', 'database.sqlite');

const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

console.log('[DB] Connected:', DB_PATH);

/** @internal Returns true if a PRAGMA table_info(...) result already has the column. */
const columnExists = (pragmaRows: any[], colName: string) => {
  const n = colName.toLowerCase();
  return pragmaRows.some((r: any) => String(r.name || '').toLowerCase() === n);
};

/** @internal Parse a raw "colName TYPE ... DEFAULT ..." column definition → bare column name. */
const extractColumnName = (colDef: string) => colDef.trim().split(/\s+/)[0].trim();

// Open once, synchronously — better-sqlite3 is always synchronous.
const _db = new Database(DB_PATH);
_db.pragma('journal_mode = WAL');
_db.pragma('foreign_keys = ON');

// ── Runtime schema guarantees (fire-and-forget; runs synchronously at startup) ──
// These cover columns added over time that may be missing from older DB files.
const guarantees: Array<[string, string]> = [
  ['customer_wallets',           'wallet_code TEXT'],
  ['merchant_pos_settlements',   'settled_at TEXT'],
  ['merchant_crypto_withdrawals','network TEXT'],
  ['crypto_transactions',        'provider_mode TEXT'],
  ['pos2013_transactions',       'updated_at TEXT DEFAULT CURRENT_TIMESTAMP'],
  ['pos2013_transactions',       'settled_at TEXT'],
  ['pos2013_transactions',       'processor_reference TEXT'],
  ['pos2013_transactions',       'auth_code_ref2 TEXT'],
  ['pos2013_transactions',       'webhook_trace TEXT'],
  ['pos2013_transactions',       'card_brand TEXT'],
  ['pos2013_transactions',       'reader_source TEXT'],
  ['pos2013_transactions',       'cvm_result TEXT'],
  ['pos2013_transactions',       'pin_verified INTEGER DEFAULT 0'],
  ['merchant_payouts',           'updated_at TEXT DEFAULT CURRENT_TIMESTAMP'],
  ['merchant_payouts',           'provider_reference TEXT'],
  ['merchant_payouts',           'meta TEXT'],
  ['merchant_payouts',           'transaction_id TEXT'],
  ['merchant_payouts',           'settled_at TEXT'],
];

for (const [table, def] of guarantees) {
  try {
    const colName = extractColumnName(def);
    const info = _db.pragma(`table_info("${table}")`);
    if (Array.isArray(info) && columnExists(info, colName)) continue;
    _db.prepare(`ALTER TABLE "${table}" ADD COLUMN ${def}`).run();
  } catch (_) {
    // table missing or other ALTER error — silently skip
  }
}

// Backfill any NULL wallet_code rows
try {
  _db.prepare(`
    UPDATE customer_wallets
    SET wallet_code = 'PSW-' || (abs(random()) % 9000 + 1000) || '-' || (abs(random()) % 9000 + 1000)
    WHERE wallet_code IS NULL OR wallet_code = ''
  `).run();
} catch (_) { /* ignore */ }

try {
  _db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_wallets_wallet_code ON customer_wallets(wallet_code)`).run();
} catch (_) { /* ignore */ }

class DbAdapter {
  /**
   * Execute a SQL statement. Public interface is async so all existing callers
   * (which await db.query(...)) require zero changes.
   *
   * Accepts both SQLite (?) and PostgreSQL ($1, $2, ...) parameter syntax.
   * Returns { rows: any[], rowCount: number } for compatibility.
   */
  async query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    // Convert Postgres $1, $2 ... to SQLite ? placeholders
    let sqliteText = text.replace(/\$(\d+)/g, '?');

    const command = sqliteText.trim().toUpperCase().split(/\s+/)[0];

    try {
      const stmt = _db.prepare(sqliteText);

      if (command === 'SELECT' || sqliteText.toUpperCase().includes('RETURNING')) {
        const rows = stmt.all(...params);
        return { rows, rowCount: rows.length };
      } else {
        const result = stmt.run(...params);
        return { rows: [], rowCount: result.changes };
      }
    } catch (err: any) {
      const msg: string = String(err?.message || '').toLowerCase();
      const isExpected =
        msg.includes('duplicate column name') ||
        msg.includes('already exists') ||
        msg.includes('no such table') ||
        msg.includes('index');
      if (!isExpected) {
        console.error('SQLite Error:', err.message, '\nQuery:', sqliteText, '\nParams:', params);
      }
      throw err;
    }
  }

  // connect() compatibility shim — SQLite is file-based and always-connected
  async connect() {
    return {
      query: this.query.bind(this),
      release: () => {},
    };
  }
}

export const db = new DbAdapter();
