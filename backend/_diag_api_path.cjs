process.chdir("F:\\POS OFFLINE SFTWR\\backend");
require("ts-node").register({ transpileOnly: true });

const svc = require("./src/domain/wallets/wallets.service");
const dbmod = require("./src/config/db");

(async () => {
  console.log("db import OK, db.query type:", typeof dbmod.db.query);
  console.log("walletsService.createCustomer type:", typeof svc.walletsService.createCustomer);
  console.log("walletsService.getCustomers type:", typeof svc.walletsService.getCustomers);

  // First: raw count via db adapter (same exact code path as service)
  const count = await dbmod.db.query("SELECT COUNT(*) as cnt FROM customers");
  console.log("\n=== RAW DB QUERY (same adapter) ===");
  console.log("count result:", JSON.stringify(count));

  // Now: call service.getCustomers()
  const custs = await svc.walletsService.getCustomers();
  console.log("\n=== SERVICE getCustomers() ===");
  console.log("customers returned:", custs.length);
  if (custs.length > 0) {
    console.log("First customer:", JSON.stringify(custs[0], null, 2));
  }
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
