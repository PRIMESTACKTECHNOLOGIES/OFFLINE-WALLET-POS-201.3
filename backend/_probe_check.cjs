const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const DB_PATH = path.join("F:\\POS OFFLINE SFTWR\\backend\\data\\database.sqlite");
console.log("DB:", DB_PATH);
const db = new sqlite3.Database(DB_PATH);
db.all("SELECT COUNT(*) as cnt FROM customers", (e, r) => console.log("Customers count:", r));
db.all("SELECT id, name FROM customers ORDER BY created_at DESC LIMIT 5", (e, r) => console.log("Last 5 customers:", JSON.stringify(r, null, 2)));
db.close();
