const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const path = require("path");
(async () => {
  const db = await open({ filename: path.join("F:\\POS OFFLINE SFTWR\\backend\\data\\database.sqlite"), driver: sqlite3.Database });
  const row = await db.get("SELECT id, name, email, phone FROM customers WHERE id = ?", ['2df069a3-cede-4496-9e01-d7dec1bf31c6']);
  console.log("DB ROW:", JSON.stringify(row, null, 2));
  if (row) {
    console.log("Name  DB match:", row.name === 'VERIFY TEST — Customer Save Confirmation' ? "PASS" : "FAIL — got: " + row.name);
    console.log("Email DB match:", row.email === 'verify-save@primestack.ae' ? "PASS" : "FAIL — got: " + row.email);
    console.log("Phone DB match:", row.phone === '+971 50 VERIFY 1' ? "PASS" : "FAIL — got: " + row.phone);
  }
  await db.close();
})();
