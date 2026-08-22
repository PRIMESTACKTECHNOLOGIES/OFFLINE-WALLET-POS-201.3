// Load .env FIRST — db.ts constructor runs at import time, before server.ts dotenv.config()
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * db.ts — sql.js adapter (pure WebAssembly, zero native binaries)
 *
 * sql.js loads a WASM SQLite into memory. On startup we:
 *   1. Load the WASM module
 *   2. Read the existing .sqlite file into a Buffer (if it exists)
 *   3. Open the DB from that Buffer (or create empty)
 *   4. After every write we flush the in-memory DB back to disk
 *
 * This approach has no native .node bindings — works on any CPU/OS/kernel.
 * The only tradeoff vs better-sqlite3: the entire DB lives in RAM.
 * For a POS system with a few thousand rows this is perfectly fine.
 */

const BACKEND_ROOT = path.join(__dirname, '../..');
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(BACKEND_ROOT, process.env.DATABASE_PATH)
  : path.join(BACKEND_ROOT, 'data', 'database.sqlite');

const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

console.log('[DB] Connected:', DB_PATH);

// ── Helpers ──────────────────────────────────────────────────────────────────

const columnExists = (pragmaRows: any[], colName: string) => {
  const n = colName.toLowerCase();
  return pragmaRows.some((r: any) => String(r.name || '').toLowerCase() === n);
};

const extractColumnName = (colDef: string) => colDef.trim().split(/\s+/)[0].trim();

// ── sql.js singleton ─────────────────────────────────────────────────────────

let _db: any = null;          // sql.js Database instance
let _dirty = false;            // true when writes need flushing to disk
let _flushTimer: any = null;   // debounce timer for disk flush

/** Persist in-memory DB to disk (debounced — max 1 write per 500ms) */
function schedulePersist() {
  _dirty = true;
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    if (_dirty && _db) {
      try {
        const data: Uint8Array = _db.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
        _dirty = false;
      } catch (e) {
        console.error('[DB] Flush error:', e);
      }
    }
  }, 500);
}

/** Flush immediately (called on graceful shutdown) */
export function flushDb() {
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  if (_dirty && _db) {
    try {
      const data: Uint8Array = _db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
      _dirty = false;
    } catch (e) {
      console.error('[DB] Flush error on shutdown:', e);
    }
  }
}

/** Lazily initialise sql.js and open/create the database */
async function getDb(): Promise<any> {
  if (_db) return _db;

  // Dynamic import — sql.js ships its own WASM file
  const initSqlJs = (await import('sql.js')).default;

  // Point sql.js at its own WASM file inside node_modules
  const wasmPath = path.join(
    BACKEND_ROOT, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'
  );

  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });

  // Open existing file or create fresh
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  // Enable WAL-equivalent pragmas
  _db.run('PRAGMA journal_mode = MEMORY;');
  _db.run('PRAGMA foreign_keys = ON;');
  _db.run('PRAGMA synchronous = NORMAL;');

  // ── Runtime schema guarantees ─────────────────────────────────────────────
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
    ['pos2013_transactions',       'decline_reason TEXT'],
  ];

  for (const [table, def] of guarantees) {
    try {
      const colName = extractColumnName(def);
      const rows = _db.exec(`PRAGMA table_info("${table}")`);
      const pragmaRows = rows.length > 0
        ? rows[0].values.map((v: any[]) => ({ name: v[1] }))
        : [];
      if (columnExists(pragmaRows, colName)) continue;
      _db.run(`ALTER TABLE "${table}" ADD COLUMN ${def}`);
    } catch (_) { /* table missing or column exists — skip */ }
  }

  // Backfill NULL wallet_code
  try {
    _db.run(`
      UPDATE customer_wallets
      SET wallet_code = 'PSW-' || (abs(random()) % 9000 + 1000) || '-' || (abs(random()) % 9000 + 1000)
      WHERE wallet_code IS NULL OR wallet_code = ''
    `);
  } catch (_) {}

  try {
    _db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_wallets_wallet_code ON customer_wallets(wallet_code)`);
  } catch (_) {}

  // Persist initial state
  schedulePersist();
  return _db;
}

// ── DbAdapter ─────────────────────────────────────────────────────────────────

class DbAdapter {
  /**
   * Execute a SQL statement.
   * Public interface is async so all existing callers (await db.query(...)) need zero changes.
   * Accepts both PostgreSQL ($1,$2) and SQLite (?) parameter syntax.
   * Returns { rows: any[], rowCount: number }.
   */
  async query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    const db = await getDb();

    // Convert Postgres $1,$2,... → SQLite ?
    const sqliteText = text.replace(/\$(\d+)/g, '?');
    const command = sqliteText.trim().toUpperCase().split(/\s+/)[0];

    // sql.js uses different APIs for SELECT vs write statements
    const isRead = command === 'SELECT' ||
      sqliteText.toUpperCase().includes(' RETURNING ');

    try {
      if (isRead) {
        const results = db.exec(sqliteText, params);
        if (!results || results.length === 0) {
          return { rows: [], rowCount: 0 };
        }
        const { columns, values } = results[0];
        const rows = values.map((val: any[]) => {
          const row: Record<string, any> = {};
          columns.forEach((col: string, i: number) => { row[col] = val[i]; });
          return row;
        });
        return { rows, rowCount: rows.length };
      } else {
        // Write statement — use run()
        db.run(sqliteText, params);
        schedulePersist();

        // For INSERT/UPDATE/DELETE return affected rows
        // sql.js doesn't expose changes() directly but we can query it
        let changes = 0;
        try {
          const res = db.exec('SELECT changes()');
          if (res.length > 0 && res[0].values.length > 0) {
            changes = Number(res[0].values[0][0]) || 0;
          }
        } catch (_) {}

        return { rows: [], rowCount: changes };
      }
    } catch (err: any) {
      const msg: string = String(err?.message || '').toLowerCase();
      const isExpected =
        msg.includes('duplicate column name') ||
        msg.includes('already exists') ||
        msg.includes('no such table') ||
        msg.includes('unique constraint') ||
        msg.includes('not unique');
      if (!isExpected) {
        console.error('[DB] Error:', err.message, '\nSQL:', sqliteText.slice(0, 200));
      }
      throw err;
    }
  }

  /** PostgreSQL Pool compatibility shim */
  async connect() {
    return {
      query: this.query.bind(this),
      release: () => {},
    };
  }
}

export const db = new DbAdapter();
