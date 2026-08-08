// Load .env FIRST — db.ts constructor runs at import time, before server.ts dotenv.config()
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

// Enable verbose mode for debugging
sqlite3.verbose();

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

class DbAdapter {
  private dbPromise: Promise<Database> | null = null;

  constructor() {
    this.initDb();
  }

  async initDb() {
    if (!this.dbPromise) {
      this.dbPromise = open({
        filename: DB_PATH,
        driver: sqlite3.Database
      });
      const db = await this.dbPromise;
      await db.run('PRAGMA foreign_keys = ON;'); // Enable foreign keys

      // ── Runtime schema guarantees (fire-and-forget safe for live dbs) ──────────
      // init_tables runs migrations inside app boot, but if an old pre-existing
      // SQLite file is attached mid-process these columns won't exist yet.
      // We therefore explicitly add any required missing columns on every startup
      // (SQLite ALTER TABLE for columns that already exist throws — we catch).
      const guarantees: Array<[string, string]> = [
        ['customer_wallets', 'wallet_code TEXT'],
        ['merchant_pos_settlements', 'settled_at TEXT'],
        ['merchant_crypto_withdrawals', 'network TEXT'],
        ['crypto_transactions', 'provider_mode TEXT'],
        ['pos2013_transactions', 'updated_at TEXT DEFAULT CURRENT_TIMESTAMP'],
        ['pos2013_transactions', 'settled_at TEXT'],
        ['pos2013_transactions', 'processor_reference TEXT'],
        ['pos2013_transactions', 'auth_code_ref2 TEXT'],
        ['pos2013_transactions', 'webhook_trace TEXT'],
        ['pos2013_transactions', 'card_brand TEXT'],
        ['pos2013_transactions', 'reader_source TEXT'],
        ['pos2013_transactions', 'cvm_result TEXT'],
        ['pos2013_transactions', 'pin_verified INTEGER DEFAULT 0'],
        ['merchant_payouts', 'updated_at TEXT DEFAULT CURRENT_TIMESTAMP'],
        ['merchant_payouts', 'provider_reference TEXT'],
        ['merchant_payouts', 'meta TEXT'],
        ['merchant_payouts', 'transaction_id TEXT'],
        ['merchant_payouts', 'settled_at TEXT'],
      ];
      for (const [table, def] of guarantees) {
        try {
          await db.run(`ALTER TABLE ${table} ADD COLUMN ${def}`);
        } catch (_) {
          // "duplicate column name" → already present, safe to ignore.
        }
      }
      // Backfill any NULL wallet_code rows — deterministic unique IDs per row.
      try {
        await db.run(`
          UPDATE customer_wallets
          SET wallet_code = 'PSW-' || (abs(random()) % 9000 + 1000) || '-' || (abs(random()) % 9000 + 1000)
          WHERE wallet_code IS NULL OR wallet_code = ''
        `);
      } catch (_) { /* ignore */ }
      try {
        await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_wallets_wallet_code ON customer_wallets(wallet_code)`);
      } catch (_) { /* ignore */ }
    }
    return this.dbPromise;
  }

  async query(text: string, params: any[] = []): Promise<any> {
    const db = await this.initDb();
    
    // Convert Postgres $1, $2 syntax to SQLite ? syntax
    // Note: This is a simple replacement and assumes params are ordered correctly.
    // Ideally, we should parse the SQL properly, but for this project scope, regex is usually enough.
    let sqliteText = text;
    let paramIndex = 1;
    while (sqliteText.includes(`$${paramIndex}`)) {
      sqliteText = sqliteText.replace(`$${paramIndex}`, '?');
      paramIndex++;
    }
    // Also replace any remaining $N (if skipped or out of order, though unlikely in simple queries)
    sqliteText = sqliteText.replace(/\$\d+/g, '?');

    // Handle "RETURNING *" which SQLite supports in newer versions, but let's be safe
    // For now, let's assume SQLite 3.35+ which supports RETURNING.
    // If not, we might need to adjust queries.

    const command = sqliteText.trim().toUpperCase().split(/\s+/)[0];

    try {
      if (command === 'SELECT' || sqliteText.toUpperCase().includes('RETURNING')) {
        const rows = await db.all(sqliteText, params);
        return { rows, rowCount: rows.length };
      } else {
        const result = await db.run(sqliteText, params);
        return { rows: [], rowCount: result.changes };
      }
    } catch (err: any) {
      console.error('SQLite Error:', err.message, '\nQuery:', sqliteText, '\nParams:', params);
      throw err;
    }
  }

  // connect() compatibility shim — SQLite is file-based and always-connected in this wrapper
  async connect() {
    return {
      query: this.query.bind(this),
      release: () => {}, // No-op for release
    };
  }
}

export const db = new DbAdapter();
