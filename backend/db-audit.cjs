const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (sql, p=[]) => new Promise((rs,rj)=>db.all(sql,p,(e,r)=>e?rj(e):rs(r)));

(async () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  LIVE DB AUDIT  (SQLite on file: data/database.sqlite)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // ── Customers & wallets ──
  console.log('── CUSTOMERS WITH WALLETS ────────────────────────────────────────');
  const c = await Q(`SELECT c.id, c.name, c.email, c.phone, c.created_at,
    w.id AS wallet_id, w.wallet_code, w.balance, w.currency, w.status AS wallet_status
    FROM customers c LEFT JOIN customer_wallets w ON w.customer_id=c.id
    ORDER BY datetime(c.created_at) DESC`);
  if (!c.length) { console.log('  (empty)'); }
  else {
    console.log(`  ${c.length} customers total`);
    c.forEach(r => console.log(
      `  • id=${r.id.slice(0,8)}…  "${r.name}"  wallet=${r.wallet_code || '(none)'}  balance=$${r.balance || 0} ${r.currency || ''} [${r.wallet_status}]`));
  }
  console.log('');

  // ── wallet_transactions ──
  console.log('── wallet_transactions TABLE ──────────────────────────────────────');
  console.log('  schema cols: id | wallet_id | type | amount | source | reference | description | pan_masked | emv_data | created_at');
  const wt_count = await Q(`SELECT COUNT(*) c FROM wallet_transactions`);
  console.log(`  rows: ${wt_count[0].c}`);
  if (wt_count[0].c === 0) {
    console.log('  ⚠️  NO ROWS — means NO movement has yet been logged into the immutable');
    console.log('      wallet ledger. All wallet writes (topups, debits, transfers, card');
    console.log('      topups, crypto purchases) MUST insert a row here or they will');
    console.log('      silently disappear from audits.');
  } else {
    const rows = await Q(`SELECT id, wallet_id, type, amount, source, reference, description, substr(created_at,1,19) AS t FROM wallet_transactions ORDER BY datetime(created_at) DESC LIMIT 8`);
    rows.forEach(r=>console.log('  •', JSON.stringify(r)));
  }
  console.log('');

  // ── customer_crypto_wallets ──
  console.log('── customer_crypto_wallets TABLE ──────────────────────────────────');
  console.log('  schema cols: id | customer_id | crypto_coin | balance | crypto_address | status | created_at');
  const cw_count = await Q(`SELECT COUNT(*) c FROM customer_crypto_wallets`);
  console.log(`  rows: ${cw_count[0].c}`);
  if (cw_count[0].c === 0) {
    console.log('  ⚠️  NO ROWS — user has never bought any crypto. buyCryptoWithWallet()');
    console.log('      auto-INSERTs a wallet row for the coin on first purchase.');
  } else {
    const rows = await Q(`SELECT c.name, w.* FROM customer_crypto_wallets w LEFT JOIN customers c ON c.id=w.customer_id ORDER BY datetime(w.created_at) DESC`);
    rows.forEach(r=>console.log(`  • ${r.name || r.customer_id.slice(0,8)}… ${r.crypto_coin} bal=${r.balance.toFixed(8)} addr=${r.crypto_address || '(internal-only)'} [${r.status}]`));
  }
  console.log('');

  // ── crypto_transactions ──
  console.log('── crypto_transactions TABLE ──────────────────────────────────────');
  console.log('  schema cols: id | customer_id | crypto_coin | transaction_type | fiat_amount(USD) | crypto_amount | exchange_rate | source | tx_hash | status');
  const ct_count = await Q(`SELECT COUNT(*) c FROM crypto_transactions`);
  console.log(`  rows: ${ct_count[0].c}`);
  if (ct_count[0].c === 0) {
    console.log('  ⚠️  NO ROWS — no immutable record of any BUY or SELL operation yet.');
    console.log('      This is written by buyCryptoWithWallet() / sellCrypto() along with');
    console.log('      the wallet balance update (logical atomic pair).');
  } else {
    const rows = await Q(`SELECT c.name, t.id, t.crypto_coin, t.transaction_type, t.fiat_amount, t.crypto_amount, t.exchange_rate, t.source, t.status, substr(t.created_at,1,19) t FROM crypto_transactions t LEFT JOIN customers c ON c.id=t.customer_id ORDER BY datetime(t.created_at) DESC LIMIT 8`);
    rows.forEach(r=>console.log('  •', JSON.stringify(r)));
  }
  console.log('');

  // ── virtual_cards ──
  console.log('── virtual_cards TABLE ────────────────────────────────────────────');
  const vc = await Q(`SELECT v.id, c.name, v.card_type, v.masked_number, v.expiry_month, v.expiry_year, v.balance, v.currency, v.status, substr(v.created_at,1,19) t FROM virtual_cards v LEFT JOIN customers c ON c.id=v.customer_id ORDER BY datetime(v.created_at) DESC`);
  console.log(`  rows: ${vc.length}`);
  vc.forEach(r=>console.log(`  • ${r.name || r.id.slice(0,8)}…  ${r.card_type} ${r.masked_number}  exp ${String(r.expiry_month).padStart(2,'0')}/${r.expiry_year}  bal=$${r.balance} ${r.currency} [${r.status}]`));
  console.log('');

  // ── merchant wallets ──
  console.log('── merchant_wallets + tx ──────────────────────────────────────────');
  const mw = await Q(`SELECT * FROM merchant_wallets ORDER BY updated_at DESC`);
  mw.forEach(r=>console.log(`  • merchant=${r.merchant_id.slice(0,8)}…  bal=$${r.balance} ${r.currency}`));
  const mwt = await Q(`SELECT * FROM merchant_wallet_transactions ORDER BY datetime(created_at) DESC LIMIT 5`);
  mwt.forEach(r=>console.log(`  • tx type=${r.type} amt=$${r.amount} src=${r.source} ref=${r.reference||''} ${r.created_at}`));
  console.log('');

  // ── ledger_entries ──
  console.log('── ledger_entries TABLE (audit journal) ───────────────────────────');
  const led = await Q(`SELECT * FROM ledger_entries ORDER BY datetime(created_at) DESC LIMIT 5`);
  console.log(`  rows: ${(await Q(`SELECT COUNT(*) c FROM ledger_entries`))[0].c}`);
  led.forEach(r=>console.log(`  • ${r.type} $${r.amount} ${r.currency} txid=${r.transaction_id.slice(0,8)}… [${r.status}] "${r.description||''}"`));
  console.log('');

  db.close();
  console.log('═══════════════════════════════════════════════════════════════════');
})().catch(e=>{console.error(e);db.close();process.exit(1);});
