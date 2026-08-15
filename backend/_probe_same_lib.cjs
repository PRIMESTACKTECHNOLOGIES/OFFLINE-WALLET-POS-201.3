const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");

const BACKEND_ROOT = "F:\\POS OFFLINE SFTWR\\backend";
const DB_PATH = path.join(BACKEND_ROOT, "data", "database.sqlite");
console.log("[probe-same] DB:", DB_PATH);

(async () => {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  
  // Exactly as getCustomers does
  const rows = await db.all(`
    SELECT
      c.id, c.name, c.email, c.phone, c.created_at, c.updated_at,
      w.id AS wallet_id,
      w.wallet_code,
      w.balance AS wallet_balance
    FROM customers c
    LEFT JOIN customer_wallets w ON w.customer_id = c.id
    ORDER BY c.created_at DESC
  `);
  console.log("Rows returned:", rows.length);
  console.log("First 3:", JSON.stringify(rows.slice(0, 3), null, 2));

  // Also test raw count
  const count = await db.get("SELECT COUNT(*) as cnt FROM customers");
  console.log("Raw COUNT(*):", count);
  await db.close();
})();
