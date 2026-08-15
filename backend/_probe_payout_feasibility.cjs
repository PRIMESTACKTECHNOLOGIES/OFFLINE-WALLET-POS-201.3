const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (sql, p=[]) => new Promise((rs,rj)=>db.all(sql,p,(e,r)=>e?rj(e):rs(r)));

(async () => {
  console.log('── BANK PAYOUT FEASIBILITY PROBE ──\n');

  console.log('1. BANK ACCOUNTS (MRC-1001 + all):');
  const ba = await Q(`SELECT id, merchant_id, customer_id, bank_name, account_holder,
    account_number, routing_number, iban, swift_code, currency, is_default, verified
    FROM bank_accounts ORDER BY merchant_id, customer_id, is_default DESC`);
  if (ba.length === 0) console.log('   (empty — NO BANK ACCOUNTS SEEDED)');
  else ba.forEach(r => console.log('  ', JSON.stringify(r)));

  console.log('\n2. merchant_payouts TABLE SCHEMA:');
  try {
    const cols = await Q(`PRAGMA table_info(merchant_payouts)`);
    cols.forEach(c => console.log(`   • ${c.name} ${c.type}`));
  } catch (e) {
    console.log('   ❌ TABLE DOES NOT EXIST:', e.message);
  }

  console.log('\n3. merchant_payouts ROWS (history):');
  try {
    const p = await Q(`SELECT * FROM merchant_payouts ORDER BY created_at DESC LIMIT 5`);
    if (p.length === 0) console.log('   (empty — no payout history yet)');
    else p.forEach(r => console.log('  ', JSON.stringify(r)));
  } catch (e) {
    console.log('   (query failed — table missing)');
  }

  console.log('\n4. bank_payouts TABLE SCHEMA + ROWS:');
  try {
    const cols = await Q(`PRAGMA table_info(bank_payouts)`);
    console.log('   schema:');
    cols.forEach(c => console.log(`     • ${c.name} ${c.type}`));
    const cnt = await Q(`SELECT COUNT(*) c FROM bank_payouts`);
    console.log(`   rows: ${cnt[0].c}`);
  } catch (e) {
    console.log('   ❌ TABLE CHECK FAILED:', e.message);
  }

  console.log('\n5. MERCHANT WALLETS (available for payout source):');
  const mw = await Q(`SELECT merchant_id, balance, currency FROM merchant_wallets`);
  mw.forEach(r => console.log(`   • ${r.merchant_id}: $${r.balance.toFixed(2)} ${r.currency}`));

  db.close();
})().catch(e=>{console.error(e);db.close();process.exit(1);});
