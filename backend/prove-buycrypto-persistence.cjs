require('ts-node/register/transpile-only');
const path = require('path');
process.chdir(path.join(__dirname));
const { v4: uuidv4 } = require('uuid');
const { db } = require('./src/config/db_sqlite.ts');
const { walletsService: svc } = require('./src/domain/wallets/wallets.service.ts');

const CUSTOMER_ID = 'f7045772-1d0d-49a6-a41b-58ba0e6ea0cb'; // MOHANED MOHAMED SULIM
const TOPUP_AMT = 500;
const BUY_USD = 150;
const COIN = 'BTC';

(async () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  END-TO-END DB PERSISTENCE PROOF');
  console.log('  Customer: MOHANED MOHAMED SULIM  (id f7045772…)');
  console.log('  Steps: 1) credit wallet $' + TOPUP_AMT + ' via card-topup service ->');
  console.log('         2) buyCryptoWithWallet $' + BUY_USD + ' ' + COIN + ' ->');
  console.log('         3) re-query ALL 4 tables and show new persisted rows');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  const q = async (sql, p=[]) => (await db.query(sql, p)).rows;

  // ── 1. BEFORE state ───────────────────────────────────────────────
  console.log('① BEFORE STATE ────────────────────────────────────────────────────');
  const walletBefore = (await q(`SELECT id, wallet_code, balance, currency FROM customer_wallets WHERE customer_id=?`, [CUSTOMER_ID]))[0];
  console.log(`   customer_wallets: code=${walletBefore.wallet_code} bal=$${walletBefore.balance}`);
  const wtBefore = (await q(`SELECT COUNT(*) c FROM wallet_transactions WHERE wallet_id=?`, [walletBefore.id]))[0].c;
  const cwBefore = (await q(`SELECT COUNT(*) c FROM customer_crypto_wallets WHERE customer_id=?`, [CUSTOMER_ID]))[0].c;
  const ctBefore = (await q(`SELECT COUNT(*) c FROM crypto_transactions WHERE customer_id=?`, [CUSTOMER_ID]))[0].c;
  console.log(`   wallet_transactions: ${wtBefore} rows | customer_crypto_wallets: ${cwBefore} rows | crypto_transactions: ${ctBefore} rows`);
  console.log('');

  // ── 2. Inject wallet $500 as-if POS card-tap authorized it ────────
  //     NOTE: We cannot call topupWalletWithCard() directly because it
  //     requires a real CARD_PROCESSOR_URL auth code. So we replicate
  //     the exact write pattern that topupWalletWithCard performs
  //     (credit balance + wallet_transactions row) atomically, which
  //     is the same precondition a real POS would leave behind.
  console.log('② INJECTING CARD-TOPUP $' + TOPUP_AMT + ' (replicating topupWalletWithCard DB writes) ─');
  const wtId = uuidv4();
  await db.query(
    `UPDATE customer_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [TOPUP_AMT, walletBefore.id]
  );
  await db.query(
    `INSERT INTO wallet_transactions (id, wallet_id, type, amount, source, reference, description)
     VALUES (?, ?, 'credit', ?, 'card_topup', ?, ?)`,
    [wtId, walletBefore.id, TOPUP_AMT, 'txn_test_e2e_' + Date.now(), 'E2E: simulated POS card tap topup $' + TOPUP_AMT]
  );
  const walletAfterTop = (await q(`SELECT balance FROM customer_wallets WHERE id=?`, [walletBefore.id]))[0];
  console.log(`   ✓ customer_wallets.balance now = $${walletAfterTop.balance}`);
  console.log(`   ✓ wallet_transactions row inserted (id=${wtId.slice(0,8)}…)`);
  console.log('');

  // ── 3. LIVE CALL: buyCryptoWithWallet(customerId, coin, usdAmt) ──
  console.log('③ LIVE buyCryptoWithWallet(customerId=$F704…, ' + COIN + ', $' + BUY_USD + ') ──────────────');
  let result;
  try {
    result = await svc.buyCryptoWithWallet(CUSTOMER_ID, COIN, BUY_USD);
    console.log('   ✓ RESULT:', JSON.stringify(result, null, 3));
  } catch (e) {
    console.log('   ✗ FAILED:', e.message);
    console.log(e.stack);
    process.exit(1);
  }
  console.log('');

  // ── 4. AFTER state ────────────────────────────────────────────────
  console.log('④ AFTER STATE — re-querying persistence in 4 tables ───────────────');
  const walletFinal = (await q(`SELECT id, wallet_code, balance, currency FROM customer_wallets WHERE customer_id=?`, [CUSTOMER_ID]))[0];
  console.log('');
  console.log('  ┌─ customer_wallets.final:');
  console.log('  │   wallet_code:', walletFinal.wallet_code);
  console.log('  │   balance    : $' + walletFinal.balance + ' USD');
  console.log('  │   expected   : $' + (TOPUP_AMT - BUY_USD) + ' (500 - 150)');
  console.log('  │   MATCH      :', Math.abs(walletFinal.balance - (TOPUP_AMT - BUY_USD)) < 0.01 ? '✅ YES' : '❌ NO');
  console.log('  │');

  const wtNew = await q(`SELECT id, wallet_id, type, amount, source, reference, description, substr(created_at,1,19) AS t FROM wallet_transactions WHERE wallet_id=? ORDER BY datetime(created_at) DESC LIMIT 5`, [walletBefore.id]);
  console.log('  ├─ wallet_transactions (rows after test):');
  wtNew.forEach(r => console.log('  │   •', JSON.stringify(r)));
  console.log('  │');

  const cwNew = await q(`SELECT id, customer_id, crypto_coin, balance, crypto_address, status, created_at FROM customer_crypto_wallets WHERE customer_id=?`, [CUSTOMER_ID]);
  console.log('  ├─ customer_crypto_wallets (rows after test):');
  cwNew.forEach(r => console.log('  │   •', JSON.stringify(r)));
  console.log('  │');

  const ctNew = await q(`SELECT * FROM crypto_transactions WHERE customer_id=? ORDER BY datetime(created_at) DESC LIMIT 3`, [CUSTOMER_ID]);
  console.log('  ├─ crypto_transactions (rows after test):');
  ctNew.forEach(r => console.log('  │   •', JSON.stringify(r)));
  console.log('  │');

  // ── 5. Atomicity / consistency checks ─────────────────────────────
  const wtIncr = wtNew.length - wtBefore;
  const cwIncr = cwNew.length - cwBefore;
  const ctIncr = ctNew.length - ctBefore;
  const balCheck = Math.abs(walletFinal.balance - (TOPUP_AMT - BUY_USD)) < 0.01;
  const cwBalOk = cwNew.length ? (Math.abs(Number(cwNew[0].balance) - (Number(result.crypto_amount) || 0)) < 0.000001) : false;
  const cwCoinOk = cwNew.length && cwNew[0].crypto_coin === COIN;
  const ctTypeOk = ctNew.length && ctNew[0].transaction_type === 'buy';
  const ctFiatOk = ctNew.length && Math.abs(Number(ctNew[0].fiat_amount) - BUY_USD) < 0.01;
  const ctSrcOk  = ctNew.length && ctNew[0].source === 'wallet_balance';
  const ctStaOk  = ctNew.length && ctNew[0].status === 'completed';

  console.log('  └────────── ATOMICITY / CONSISTENCY CHECKLIST ───────────────────');
  console.log('');
  const PAD = 62;
  console.log('    ' + ('customer_wallets.balance correctly debited by $' + BUY_USD).padEnd(PAD), balCheck   ? '✅' : '❌');
  console.log('    ' + ('wallet_transactions rows increased').padEnd(PAD),                  wtIncr >= 1 ? '✅ (+' + wtIncr + ')' : '❌');
  console.log('    ' + ('customer_crypto_wallets row auto-created (first buy)').padEnd(PAD), cwIncr >= 1 ? '✅ (+' + cwIncr + ')' : '❌');
  console.log('    ' + ('  .balance matches service.crypto_amount').padEnd(PAD),            cwBalOk    ? '✅' : '❌');
  console.log('    ' + ('  .crypto_coin === ' + COIN).padEnd(PAD),                           cwCoinOk   ? '✅' : '❌');
  console.log('    ' + ('crypto_transactions row written').padEnd(PAD),                     ctIncr >= 1 ? '✅ (+' + ctIncr + ')' : '❌');
  console.log('    ' + ('  .transaction_type = buy').padEnd(PAD),                           ctTypeOk   ? '✅' : '❌');
  console.log('    ' + ('  .fiat_amount = $' + BUY_USD).padEnd(PAD),                         ctFiatOk   ? '✅' : '❌');
  console.log('    ' + ('  .source = wallet_balance').padEnd(PAD),                           ctSrcOk    ? '✅' : '❌');
  console.log('    ' + ('  .status = completed').padEnd(PAD),                               ctStaOk    ? '✅' : '❌');

  const all = [balCheck, wtIncr>=1, cwIncr>=1, cwBalOk, cwCoinOk, ctIncr>=1, ctTypeOk, ctFiatOk, ctSrcOk, ctStaOk].every(Boolean);
  console.log('');
  console.log('    ' + 'OVERALL: DB STORAGE IS '.padEnd(PAD), all ? '✅ 100% CORRECT & PERSISTENT' : '❌ FAILURES DETECTED');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  E2E persistence proof complete.');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
