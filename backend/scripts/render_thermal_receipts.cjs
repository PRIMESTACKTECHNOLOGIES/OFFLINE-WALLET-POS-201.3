process.env.DATABASE_PATH = process.env.DATABASE_PATH || require('path').resolve(__dirname, '..', 'data', 'database.sqlite');
process.env.ENFORCE_HARD_PINNED_DB = process.env.ENFORCE_HARD_PINNED_DB || '1';

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs', target: 'es2020', esModuleInterop: true, skipLibCheck: true }
});

const path = require('path');
const fs = require('fs');
const { thermalReceiptService } = require(path.resolve(__dirname, '..', 'src', 'domain', 'receipts', 'thermalReceipt.service.ts'));
const { db } = require(path.resolve(__dirname, '..', 'src', 'config', 'db.ts'));

async function main() {
  console.log('DB_PATH:', process.env.DATABASE_PATH);
  const rows = await db.query(`
    SELECT id, merchant_id, amount_minor, currency, stan, auth_code, pan_masked, txn_timestamp, status
    FROM pos2013_transactions ORDER BY txn_timestamp DESC LIMIT 5
  `);
  console.log('\nFound transactions:');
  for (const r of rows.rows) {
    console.log('  id:', r.id, '  $', (r.amount_minor/100).toLocaleString(), r.currency, '  STAN:', r.stan, '  AUTH:', r.auth_code, '  STATUS:', r.status);
  }
  const outDir = path.resolve(__dirname, '..', '..', 'thermal_receipts_out');
  fs.mkdirSync(outDir, { recursive: true });

  for (const r of rows.rows) {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log(`GENERATING: ${r.id}  ($${(r.amount_minor/100).toLocaleString()} ${r.currency})`);
    console.log('═══════════════════════════════════════════════════════════════════════');
    const out = await thermalReceiptService.generateForTransaction(r.id, r.merchant_id);
    if (!out) { console.log('  NOT FOUND'); continue; }

    const fileSafeId = String(r.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    fs.writeFileSync(path.join(outDir, `${fileSafeId}__CUSTOMER.txt`), out.thermalCustomer, 'utf8');
    fs.writeFileSync(path.join(outDir, `${fileSafeId}__MERCHANT.txt`), out.thermalMerchant, 'utf8');
    fs.writeFileSync(path.join(outDir, `${fileSafeId}__DUAL_COMBINED.txt`), out.thermalCombined, 'utf8');
    fs.writeFileSync(path.join(outDir, `${fileSafeId}__CUSTOMER__SCREEN.txt`), out.plainCustomer, 'utf8');

    console.log('\n─── CUSTOMER COPY (SCREEN PLAIN) ─────────────────────────────────────');
    console.log(out.plainCustomer);
  }
  console.log('\n\nSaved files to:', outDir);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
