// Legacy adapter — re-exports the active db singleton from db.ts
// (previously used sqlite3 directly; migrated to better-sqlite3)
export { db } from './db';
