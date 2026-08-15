// Full audit of merchant USD balance $1055.48, total_sales $50, settlement balance $1055.48
// Show EVERY row so user can confirm exactly which are REAL vs SIM/MOCK.
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');
const DB = path.resolve(__dirname, '..', 'data', 'database.sqlite');

(async () => {
  const db = await open({ filename: DB, driver: sqlite3.Database });
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('DB: ' + DB);
  console.log('═══════════════════════════════════════════════════════════════════');

  // ---- 1. Overview counts ----
  const cnt = {};
  for (const t of ['pos2013_transactions','merchant_wallet_transactions','merchant_pos_settlements','ledger_entries','merchant_crypto_balances','crypto_transactions','customer_wallets','pos2013_batches','pos_idempotency','receipts','wallet_transfers','incoming_payments','cashouts','bank_payouts','merchant_payouts','settlement_discrepancies','offline_funds_receipts','payment_codes','merchant_wallets']) {
    try { const r = await db.get(`SELECT COUNT(*) AS c FROM ${t}`); cnt[t] = r.c; } catch(e) { cnt[t] = 'ERR: '+e.message.split('\n')[0]; }
  }
  console.log('\n[1] TABLE COUNTS');
  console.log('    pos2013_transactions=', cnt.pos2013_transactions);
  console.log('    pos2013_batches     =', cnt.pos2013_batches);
  console.log('    pos_idempotency     =', cnt.pos_idempotency);
  console.log('    merchant_wallets    =', cnt.merchant_wallets);
  console.log('    merchant_wallet_tx  =', cnt.merchant_wallet_transactions);
  console.log('    merchant_settlements=', cnt.merchant_pos_settlements);
  console.log('    merchant_crypto     =', cnt.merchant_crypto_balances);
  console.log('    crypto_transactions =', cnt.crypto_transactions);
  console.log('    customer_wallets    =', cnt.customer_wallets);
  console.log('    ledger_entries      =', cnt.ledger_entries);
  console.log('    receipts            =', cnt.receipts);
  console.log('    offline_funds_rcpts =', cnt.offline_funds_receipts);
  console.log('    wallet_transfers    =', cnt.wallet_transfers);
  console.log('    incoming_payments   =', cnt.incoming_payments);
  console.log('    cashouts            =', cnt.cashouts);
  console.log('    bank_payouts        =', cnt.bank_payouts);
  console.log('    merchant_payouts    =', cnt.merchant_payouts);
  console.log('    settlement_discr    =', cnt.settlement_discrepancies);
  console.log('    payment_codes       =', cnt.payment_codes);

  // ---- 2. Merchant wallets (balances) ----
  const merch = await db.all('SELECT * FROM merchant_wallets ORDER BY merchant_id, currency');
  console.log('\n[2] MERCHANT WALLETS (balances)');
  merch.forEach(w => console.log(`    id=${w.id}  merchant=${w.merchant_id}  currency=${w.currency}  balance=${w.balance.toFixed(2)}  bonus_balance=${Number(w.bonus_balance||0).toFixed(2)}`));
  const usd = merch.find(w=>w.currency==='USD') || {balance:0};
  const aed = merch.find(w=>w.currency==='AED') || {balance:0};
  console.log(`    → USD AVAILABLE = ${Number(usd.balance).toFixed(2)}`);
  console.log(`    → AED AVAILABLE = ${Number(aed.balance).toFixed(2)}`);

  // ---- 3. Every merchant_wallet_transactions row (ALL credits/debits) ----
  const tx = await db.all(`SELECT id, merchant_id, wallet_id, transaction_type, direction, amount, currency, source, reference, note, created_at FROM merchant_wallet_transactions ORDER BY id ASC`);
  console.log('\n[3] EVERY MERCHANT WALLET CREDIT/DEBIT (sum these to explain balance=$' + Number(usd.balance + aed.balance).toFixed(2) + ')');
  let usdSum=0, aedSum=0;
  tx.forEach(r => {
    const amt = Number(r.amount);
    if (r.currency==='USD') usdSum += (r.direction==='credit'? amt : -amt);
    if (r.currency==='AED') aedSum += (r.direction==='credit'? amt : -amt);
    const mock = /(offline_batch|SYSTEM_REPLAY|sim_|simulation|manual_|seed_demo|e2e_|POS_SIM|SYNC_SIM|SYNC|demo|fallback|STANDIN|mohamed|HARRIS|Harris|txn_178667|STAN 00000[1234]|sync_batch_sim|8257|card_test|STAN 000005|STAN 000006|STAN 000007|STAN 000008|batch_sim|no_processor_floor|5000\.00|1150\.00|350\.50|292\.61)/i.test([r.source,r.reference,r.note,r.transaction_type].join('|')) ? '🔴 MOCK/TEST/SIM' : '✅ REAL';
    console.log(`    ${mock}  #${r.id} ${r.direction.toUpperCase().padEnd(6)} $${amt.toFixed(2)} ${r.currency}  type=${r.transaction_type.padEnd(20)}  src=${(r.source||'').padEnd(24)}  ref=${(r.reference||'').padEnd(22)}  note=${r.note||''}`);
  });
  console.log(`    → USD cumulative from txns: ${usdSum.toFixed(2)}  (merchant_wallets says: ${Number(usd.balance).toFixed(2)})`);
  console.log(`    → AED cumulative from txns: ${aedSum.toFixed(2)}  (merchant_wallets says: ${Number(aed.balance).toFixed(2)})`);
  if (usdSum.toFixed(2) !== Number(usd.balance).toFixed(2) || aedSum.toFixed(2) !== Number(aed.balance).toFixed(2)) {
    console.log('    ⚠️ WARNING: balance does not match transactions (orphan rows or direct UPDATE without txn row).');
  }

  // ---- 4. Every pos2013_transactions row (the $50 Total Sales) ----
  const pos = await db.all(`SELECT id, batch_id, stan, terminal_id, merchant_id, transaction_id, status, pan_masked, entry_mode, auth_mode, amount_minor, currency, auth_code, decline_reason, created_at, synced_at FROM pos2013_transactions ORDER BY id ASC`);
  console.log('\n[4] EVERY POS2013 TRANSACTION (UI says Total Sales $' + (pos.filter(r=>r.status==='APPROVED').reduce((s,r)=>s+Number(r.amount_minor)/100,0).toFixed(2)) + ')');
  pos.forEach(r => {
    const amt = Number(r.amount_minor)/100;
    const mock = (/WEB-TERMINAL|txn_1786672752762_giowwwfwu|batch_sim|sim_|mohamed|HARRIS|Harris|8257|txn_178667|STAN 00000[1-9]|demo|standin|fallback/i.test([r.terminal_id,r.transaction_id,r.pan_masked,r.batch_id,r.decline_reason||''].join('|')) || r.terminal_id==='WEB-TERMINAL' || r.status==='SYNCED' || /OFFLINE_APPROVED.*no.*EMV|FLOOR/i.test(r.auth_mode||'')) ? '🔴 MOCK/TEST/SIM/DEMO' : (r.status==='APPROVED' ? '✅ APPROVED AUDIT' : r.status);
    console.log(`    ${mock}  id=${r.id}  status=${(r.status||'').padEnd(10)}  STAN=${(r.stan||'').padEnd(8)}  terminal=${(r.terminal_id||'').padEnd(16)}  $${amt.toFixed(2)} ${r.currency}  pan=${r.pan_masked}  auth=${(r.auth_mode||'').padEnd(20)}  authCode=${r.auth_code||''}  decline=${r.decline_reason||''}`);
  });

  // ---- 5. Every merchant_pos_settlements row ----
  const s = await db.all(`SELECT id, merchant_id, pos_transaction_id, transaction_id, stan, amount, currency, status, settlement_batch, settled_at, created_at FROM merchant_pos_settlements ORDER BY id ASC`);
  console.log('\n[5] EVERY SETTLEMENT ROW (UI says Settlement Balance $' + (s.filter(r=>r.status==='unsettled').reduce((t,r)=>t+Number(r.amount),0).toFixed(2)) + ')');
  s.forEach(r => {
    const mock = (/WEB-TERMINAL|txn_178667|sim_|STAN 00000[1-9]|batch_sim|mohamed|HARRIS|Harris|8257|demo|standin|fallback|350\.50|292\.61|1150\.00|5000\.00/i.test([r.transaction_id,r.stan,r.settlement_batch||''].join('|')) || !r.pos_transaction_id || r.stan==='SYNCED') ? '🔴 MOCK/TEST/SIM/DEMO' : (r.status==='unsettled' ? '✅ UNSETTLED PENDING BANK' : '✅ SETTLED');
    console.log(`    ${mock}  #${r.id}  status=${(r.status||'').padEnd(12)}  $${Number(r.amount).toFixed(2)} ${r.currency}  STAN=${String(r.stan||'').padEnd(8)}  settlement_batch=${r.settlement_batch||''}  pos_txn_id=${r.pos_transaction_id || '(MISSING — audit bug)'}  txn=${r.transaction_id||''}`);
  });

  // ---- 6. Customer wallets (loaded value) ----
  const cw = await db.all(`SELECT id, customer_id, currency, balance, bonus_balance, wallet_code, created_at FROM customer_wallets ORDER BY id ASC`);
  console.log('\n[6] CUSTOMER LOADED VALUE WALLETS (any $ here → MOCK if the customer was not a real cash load today)');
  cw.forEach(r => {
    const mock = /(psw|demo|sim|test|mohamed|harris|Harris)/i.test([r.wallet_code,r.customer_id].join('|')) ? '🔴 MOCK/TEST/SIM/DEMO' : '✅ REAL';
    console.log(`    ${mock}  wallet#${r.id}  customer=${r.customer_id}  code=${r.wallet_code||''}  bal=$${Number(r.balance).toFixed(2)} ${r.currency}`);
  });

  // ---- 7. Crypto balances (mock flag shown) ----
  const cb = await db.all(`SELECT merchant_id, customer_id, asset, balance, locked, is_mock, updated_at FROM merchant_crypto_balances ORDER BY id ASC`);
  console.log('\n[7] MERCHANT/CRYPTO BALANCES (if is_mock=1 → NOT REAL)');
  cb.forEach(r => {
    const mock = Number(r.is_mock)===1 ? '🔴 MOCK/TEST/SIM' : '✅ LIVE';
    console.log(`    ${mock}  ${r.asset}  bal=${Number(r.balance).toFixed(8)}  locked=${Number(r.locked||0).toFixed(8)}  merch=${r.merchant_id||''} cust=${r.customer_id||''}`);
  });

  // ---- 8. Ledger summary ----
  const led = await db.all(`SELECT id, source_type, source_ref, type, amount, currency, debit_account, credit_account, note FROM ledger_entries ORDER BY id ASC`);
  console.log('\n[8] LEDGER ENTRIES (non-seed rows = flagged)');
  led.forEach(r => {
    const seed = /seed|migration|initial/i.test(r.source_type||'') || Number(r.id) <= 3;
    const mock = seed ? '🌱 SEED MIGRATION (keep)' : (/offline_batch|SYSTEM_REPLAY|sim_|POS_SIM|SYNC|demo|standin|fallback|mohamed|HARRIS|Harris|350\.50|292\.61|1150\.00|5000\.00|txn_178667/i.test([r.source_ref,r.note,r.source_type].join('|')) ? '🔴 MOCK/TEST/SIM/DEMO' : '✅ REAL');
    console.log(`    ${mock}  #${r.id}  ${r.type.padEnd(16)}  $${Number(r.amount).toFixed(2)} ${r.currency}  debit=${(r.debit_account||'').padEnd(28)} credit=${(r.credit_account||'').padEnd(28)}  ref=${r.source_ref||''}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('[SUMMARY] EVERY 🔴 ROW ABOVE = MOCK/TEST/SIM. Cleanup script will DELETE ALL 🔴 ROWS + ZERO MERCHANT/CUSTOMER BALANCES.');
  console.log('After cleanup: Merchant USD=0 AED=0, Customer wallets=0, settlements=0, pos_txn=0, merch_tx=0, crypto=0, ledger=3 (seed only), ONLY config left (terminals, products, merchant_settings, admin_users, bank_accounts).');
  console.log('═══════════════════════════════════════════════════════════════════');

  await db.close();
})().catch(e => { console.error(e); process.exit(1); });
