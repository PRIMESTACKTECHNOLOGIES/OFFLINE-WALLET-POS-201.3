const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (s, p=[]) => new Promise((rs, rj) => db.all(s, p, (e, r) => e ? rj(e) : rs(r)));
(async () => {
  for (const t of ['merchant_wallets','merchant_wallet_transactions','customer_wallets','customer_crypto_wallets','crypto_transactions','ledger_entries','merchant_payouts','bank_accounts']) {
    const cols = await Q(`PRAGMA table_info(${t})`);
    console.log('\n■ TABLE:', t, `(${cols.length} cols)`);
    cols.forEach(c => console.log(`   ${c.cid.toString().padStart(2)}  ${c.name.padEnd(38)} ${c.type.padEnd(12)}  ${c.notnull?'NOT NULL':''}  pk=${c.pk}${c.dflt_value?`  DEFAULT ${c.dflt_value}`:''}`));
  }
  console.log('\n■ merchant_wallets rows:');
  const r = await Q(`SELECT * FROM merchant_wallets`);
  r.forEach(x => console.log('  ', JSON.stringify(x)));
  db.close();
})().catch(e => { console.error(e); db.close(); });
