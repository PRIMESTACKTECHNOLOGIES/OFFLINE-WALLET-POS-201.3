const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPaths = [
  path.join(__dirname, 'data', 'database.sqlite'),
  path.join(__dirname, '..', 'database.sqlite'),
];

async function diagDb(dbPath) {
  console.log('\n' + '='.repeat(80));
  console.log('DIAGNOSTIC FOR:', dbPath);
  console.log('Exists:', fs.existsSync(dbPath));
  console.log('Size MB:', fs.existsSync(dbPath) ? (fs.statSync(dbPath).size / 1024 / 1024).toFixed(2) : 'N/A');
  console.log('='.repeat(80));

  if (!fs.existsSync(dbPath)) return;

  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

  const q = (sql) => new Promise((res, rej) => {
    db.all(sql, (e, r) => e ? rej(e) : res(r));
  });

  try {
    const tables = await q(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    console.log('\nTable count:', tables.length);
    console.log('Tables:', tables.map(t => t.name).join(', '));

    // Core transaction count
    try {
      const txCount = await q(`SELECT COUNT(*) AS c FROM pos2013_transactions`);
      console.log('\npos2013_transactions rows:', txCount[0]?.c ?? 0);
    } catch(e) { console.log('  pos2013_transactions: MISSING'); }

    try {
      const rcptCount = await q(`SELECT COUNT(*) AS c FROM receipts`);
      console.log('receipts rows:', rcptCount[0]?.c ?? 0);
    } catch(e) { console.log('  receipts: MISSING'); }

    try {
      const batchCount = await q(`SELECT COUNT(*) AS c FROM pos2013_batches`);
      console.log('pos2013_batches rows:', batchCount[0]?.c ?? 0);
    } catch(e) { console.log('  pos2013_batches: MISSING'); }

    try {
      const settCount = await q(`SELECT COUNT(*) AS c FROM transaction_settlements`);
      console.log('transaction_settlements rows:', settCount[0]?.c ?? 0);
    } catch(e) {}

    // Ghost detection - auth_code '0000' = mock ghost
    try {
      const ghostAuth = await q(`SELECT COUNT(*) AS c FROM pos2013_transactions WHERE auth_code = '0000' OR auth_code IS NULL OR auth_code = ''`);
      const realAuth = await q(`SELECT COUNT(*) AS c FROM pos2013_transactions WHERE auth_code IS NOT NULL AND auth_code != '' AND auth_code != '0000'`);
      const total = await q(`SELECT COUNT(*) AS c FROM pos2013_transactions`);
      const t = total[0]?.c ?? 0;
      const g = ghostAuth[0]?.c ?? 0;
      const r = realAuth[0]?.c ?? 0;
      console.log('\n[REAL vs GHOST CHECK (Protocol 101.1 rule: 0000 = ghost)]');
      console.log(`  Ghost auth_codes (0000/null/empty): ${g}  (${t ? (g/t*100).toFixed(1) : 0}%)`);
      console.log(`  Real auth_codes (4-digit non-zero):  ${r}  (${t ? (r/t*100).toFixed(1) : 0}%)`);
      console.log(`  Total transactions:                  ${t}`);
    } catch(e) { console.log('  ghost check error:', e.message); }

    // Sample some rows
    try {
      const sample = await q(`SELECT * FROM pos2013_transactions LIMIT 5`);
      console.log('\nSample transactions (first 5):');
      sample.forEach((s, i) => {
        console.log(`  [${i}] id=${s.id?.slice(0,12)} | amt=${s.amount_minor}${s.currency||''} | pan=${s.pan_masked} | auth=${s.auth_code} | brand=${s.card_brand} | mode=${s.entry_mode} | status=${s.status}`);
      });
    } catch(e) {}

    // Receipt integrity
    try {
      const txWithReceipt = await q(`SELECT COUNT(DISTINCT t.id) AS c FROM pos2013_transactions t INNER JOIN receipts r ON t.id = r.transaction_id`);
      const txWithoutReceipt = await q(`SELECT COUNT(*) AS c FROM pos2013_transactions t LEFT JOIN receipts r ON t.id = r.transaction_id WHERE r.id IS NULL`);
      console.log('\n[RECEIPT INTEGRITY]');
      console.log(`  TX with matching receipt:    ${txWithReceipt[0]?.c ?? 0}`);
      console.log(`  TX WITHOUT any receipt:      ${txWithoutReceipt[0]?.c ?? 0}`);
      const rcptEmpty = await q(`SELECT COUNT(*) AS c FROM receipts WHERE receipt_data IS NULL OR receipt_data = '' OR receipt_data = '{}'`);
      console.log(`  Receipts with empty payload: ${rcptEmpty[0]?.c ?? 0}`);
    } catch(e) {}

    // Status distribution
    try {
      const statusDist = await q(`SELECT status, COUNT(*) AS c FROM pos2013_transactions GROUP BY status`);
      console.log('\n[STATUS DISTRIBUTION]');
      statusDist.forEach(s => console.log(`  ${s.status || 'NULL'}: ${s.c}`));
    } catch(e) {}

    // Card brand distribution
    try {
      const brandDist = await q(`SELECT card_brand, COUNT(*) AS c FROM pos2013_transactions GROUP BY card_brand`);
      console.log('\n[CARD BRAND DISTRIBUTION]');
      brandDist.forEach(b => console.log(`  ${b.card_brand || 'NULL'}: ${b.c}`));
    } catch(e) {}

    // Entry mode distribution
    try {
      const entryDist = await q(`SELECT entry_mode, COUNT(*) AS c FROM pos2013_transactions GROUP BY entry_mode`);
      console.log('\n[ENTRY MODE DISTRIBUTION]');
      entryDist.forEach(e => console.log(`  ${e.entry_mode || 'NULL'}: ${e.c}`));
    } catch(e) {}

    // Amount range
    try {
      const stats = await q(`SELECT MIN(amount_minor) AS mn, MAX(amount_minor) AS mx, AVG(amount_minor) AS av, SUM(amount_minor) AS sm FROM pos2013_transactions`);
      const s = stats[0] || {};
      console.log('\n[AMOUNT STATS (minor units)]');
      console.log(`  Min: ${s.mn}  Max: ${s.mx}  Avg: ${s.av?.toFixed?.(0) ?? s.av}  Total: ${s.sm}`);
    } catch(e) {}

    // Merchant / Terminal check
    try {
      const merchDist = await q(`SELECT merchant_id, COUNT(*) AS c FROM pos2013_transactions GROUP BY merchant_id`);
      console.log('\n[MERCHANT DISTRIBUTION]');
      merchDist.forEach(m => console.log(`  ${m.merchant_id}: ${m.c}`));
    } catch(e) {}

    // Determination
    const totalTx = (await q(`SELECT COUNT(*) AS c FROM pos2013_transactions`))[0]?.c ?? 0;
    const realTx = (await q(`SELECT COUNT(*) AS c FROM pos2013_transactions WHERE auth_code IS NOT NULL AND auth_code != '' AND auth_code != '0000'`))[0]?.c ?? 0;
    const pct = totalTx ? (realTx / totalTx * 100) : 0;
    console.log('\n' + '-'.repeat(60));
    if (totalTx === 0) {
      console.log('  VERDICT: DATABASE IS EMPTY — NO TRANSACTIONS AT ALL');
    } else if (pct < 50) {
      console.log(`  VERDICT: DATABASE IS NOT REAL — ${pct.toFixed(1)}% real auth codes, needs population`);
    } else {
      console.log(`  VERDICT: DATABASE LOOKS REAL — ${pct.toFixed(1)}% real auth codes (>= 50% threshold)`);
    }
    console.log('-'.repeat(60));

  } finally {
    db.close();
  }
}

(async () => {
  for (const p of dbPaths) {
    try { await diagDb(p); } catch(e) { console.log('ERROR:', p, e.message); }
  }
})();
