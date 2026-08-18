import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
process.env.DATABASE_PATH = process.env.DATABASE_PATH || path.resolve(__dirname, "..", "data", "database.sqlite");
process.env.ENFORCE_HARD_PINNED_DB = process.env.ENFORCE_HARD_PINNED_DB || "1";

import { thermalReceiptService } from "../src/domain/receipts/thermalReceipt.service";
import { db } from "../src/config/db";

async function main() {
  console.log("DB_PATH:", process.env.DATABASE_PATH);
  const rows = await db.query(`
    SELECT id, merchant_id, amount_minor, currency, stan, auth_code, pan_masked, txn_timestamp, status
    FROM pos2013_transactions ORDER BY txn_timestamp DESC LIMIT 10
  `);
  console.log("\nFound transactions:");
  for (const r of rows.rows as any[]) {
    console.log(
      "  id:", r.id.padEnd(42),
      "  $", (r.amount_minor / 100).toLocaleString().padStart(12),
      r.currency,
      "  STAN:", (r.stan || "-").padStart(8),
      "  AUTH:", r.auth_code || "-",
      "  STATUS:", r.status
    );
  }
  const outDir = path.resolve(__dirname, "..", "..", "thermal_receipts_out");
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];

  for (const r of rows.rows as any[]) {
    console.log("\n" + "═".repeat(88));
    console.log("GENERATING RECEIPT: " + r.id + "  ($" + (r.amount_minor / 100).toLocaleString() + " " + r.currency + ")");
    console.log("═".repeat(88));
    const out = await thermalReceiptService.generateForTransaction(r.id, r.merchant_id);
    if (!out) { console.log("  NOT FOUND / SKIPPED"); continue; }

    const fileSafeId = String(r.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    const custPath = path.join(outDir, fileSafeId + "__CUSTOMER.txt");
    const mercPath = path.join(outDir, fileSafeId + "__MERCHANT.txt");
    const dualPath = path.join(outDir, fileSafeId + "__DUAL_COMBINED.txt");
    const scrnPath = path.join(outDir, fileSafeId + "__CUSTOMER__SCREEN.txt");
    fs.writeFileSync(custPath, out.thermalCustomer, "utf8");  files.push(custPath);
    fs.writeFileSync(mercPath, out.thermalMerchant, "utf8");  files.push(mercPath);
    fs.writeFileSync(dualPath, out.thermalCombined, "utf8");  files.push(dualPath);
    fs.writeFileSync(scrnPath, out.plainCustomer, "utf8");    files.push(scrnPath);

    console.log("\n─── CUSTOMER COPY (SCREEN PREVIEW) ─────────────────────────────────");
    console.log(out.plainCustomer);
  }
  console.log("\n" + "█".repeat(88));
  console.log("FILES SAVED:");
  for (const f of files) console.log("  · " + f);
  process.exit(0);
}
main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
