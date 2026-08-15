process.chdir("F:\\POS OFFLINE SFTWR\\backend");
require("ts-node").register({ transpileOnly: true });
const dbmod = require("./src/config/db");

const sql = `
  SELECT
    c.id, c.name, c.email, c.phone, c.created_at, c.updated_at,
    w.id AS wallet_id,
    w.wallet_code,
    w.balance AS wallet_balance
  FROM customers c
  LEFT JOIN customer_wallets w ON w.customer_id = c.id
  ORDER BY c.created_at DESC
`;

(async () => {
  console.log("SQL start:", JSON.stringify(sql.substring(0, 30)));
  console.log("After trim start:", JSON.stringify(sql.trim().substring(0, 30)));
  console.log("Command word:", JSON.stringify(sql.trim().toUpperCase().split(" ")[0]));

  // Run through db adapter
  const res = await dbmod.db.query(sql);
  console.log("\n=== DB ADAPTER QUERY RESULT ===");
  console.log("rows.length:", res.rows.length);
  console.log("rowCount:", res.rowCount);
  if (res.rows.length > 0) {
    console.log("row[0]:", JSON.stringify(res.rows[0], null, 2));
  }

  // Also: test without LEFT JOIN
  const simple = await dbmod.db.query("SELECT id, name FROM customers ORDER BY created_at DESC LIMIT 3");
  console.log("\n=== SIMPLE QUERY (no join) ===");
  console.log("rows:", JSON.stringify(simple.rows, null, 2));
})().catch(e => { console.error("ERR:", e); });
