const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const DB_PATH = path.join("F:\\POS OFFLINE SFTWR\\backend\\data\\database.sqlite");

(async () => {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  const all = await db.all(`
    SELECT c.id, c.name, c.email, c.phone, c.created_at, w.wallet_code
    FROM customers c LEFT JOIN customer_wallets w ON w.customer_id = c.id
    ORDER BY c.created_at DESC
  `);
  console.log("ALL CUSTOMERS CURRENTLY (" + all.length + "):");
  all.forEach((c, i) => {
    console.log(`  [${i+1}] ${c.id.substring(0,8)}.. | ${c.name.padEnd(28)} | ${c.email || 'no-email'} | ${c.phone || 'no-phone'} | wallet=${c.wallet_code || 'NONE'}`);
  });
  await db.close();
})();
