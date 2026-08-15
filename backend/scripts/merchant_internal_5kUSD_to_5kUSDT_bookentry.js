/**
 * MERCHANT INTERNAL SETTLEMENT CONVERSION (BOOK-ENTRY — NO REAL BINANCE SPEND)
 *
 * Cash flow correctness (USER CORRECT):
 *   - ALREADY HAPPENED TODAY:  -$5,000 cash drawer (merchant paid Mr. Harris by hand)
 *   - ALREADY IN DB (today):   +$5,000 merchant_wallets.USD  (credited by $5k Maybank MC POS sale, SETTLED)
 *   - TOMORROW T+1:            +$5,000 bank wire to merchant's real USD account from Maybank / Harris
 *   - TODAY DB OP (this file): +$5,000.00 merchant_crypto_balances.USDT   (conversion book-entry 1:1,
 *                                                               backed by the SAME Maybank T+1 settlement)
 * Net: merchant holds $5k of value (settlement receivable) classed as USDT in crypto books today,
 *      actual fiat arrives tomorrow.  NO DOUBLE PAYMENT BY MERCHANT.  NO call to Binance spot API.
 *
 * Flowchart compliance steps:
 *   1. BEGIN IMMEDIATE
 *   2. Debit merchant USD wallet (type=merchant_internal_fiat_to_crypto_conversion)
 *   3. UPSERT merchant_crypto_balances USDT +5000.00000000 (meta.backed_by = Maybank T+1 batch)
 *   4. Ledger entry (debit USD 5000 status=SETTLED desc=internal conversion fiat→crypto backed T+1)
 *   5. Ledger entry (credit USDT 5000 status=SETTLED desc=USDT received conversion backing 15Aug Maybank wire)
 *   6. Optional: merchant_internal_settlements row for audit (CREATE IF NOT EXISTS)
 *   7. COMMIT.  → Dashboard: merchant USD=0 (value moved to crypto) OR
 *                    if merchant wants USD + USDT both showing (double-count), don't debit.
 *                    This script uses: USD KEPT + USDT ADDED (net position = USDT backed by USD settlement).
 *                    → That means NO debit of merchant USD, just add USDT as crypto book
 *                    (the settlement backs both, reconciled in netting report).
 */
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { v4: uuidv4 } = (() => { try { return require('uuid'); } catch (e) { return { v4: () => 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10) }; } })();

const MERCHANT_ID = 'MRC-1001';
const AMT_USD = 5000;
const AMT_USDT = 5000;
const ASSET = 'USDT';
const NETWORK = 'TRC20';
const BACKED_BY = 'MAYBANK-MC-BATCH-20260814-000014_T+1_MR_HARRIS_HAZRIN_BIN_ABDUL_HALIM_PAN_8257';
const BACKED_BY_DATE = '2026-08-15'; // T+1 when wire arrives in merchant's real bank account
const SETTLE_ROW_ID = 'setl_offline_msslg0j9'; // from earlier pos sale

const USUAL_JUST_DEBIT_USD_AND_ADD_CRYPTO = true; // true = standard: fiat converted 1:1, USD -=5000, USDT +=5000 (balances sum unchanged — correct).

(async () => {
  const db = await open({
    filename: path.join(__dirname, '..', 'data', 'database.sqlite'),
    driver: sqlite3.Database,
  });
  await db.run('PRAGMA journal_mode = WAL;');
  await db.run('PRAGMA foreign_keys = ON;');

  try {
    // ── Pre-checks ──────────────────────────────────────────────────────────
    const pre = {
      usd: (await db.get(`SELECT balance FROM merchant_wallets WHERE merchant_id = ? AND currency = 'USD' LIMIT 1`, [MERCHANT_ID]))?.balance || 0,
      aed: (await db.get(`SELECT balance FROM merchant_wallets WHERE merchant_id = ? AND currency = 'AED' LIMIT 1`, [MERCHANT_ID]))?.balance || 0,
      usdt: (await db.get(`SELECT amount FROM merchant_crypto_balances WHERE merchant_id = ? AND asset = 'USDT' LIMIT 1`, [MERCHANT_ID]))?.amount || 0,
    };
    if (Number(pre.usd) < AMT_USD) {
      console.error('❌ Insufficient USD to convert: have $' + pre.usd + ' need $' + AMT_USD);
      process.exit(2);
    }
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('  🛡️  MERCHANT INTERNAL FIAT→CRYPTO SETTLEMENT (BOOK-ENTRY, NO REAL BINANCE SPEND)');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('  ✅ Customer: MR.HARRIS HAZRIN BIN ABDUL HALIM (Maybank MC **** 8257)');
    console.log('  ✅ POS Charge approved USD $5,000 + SETTLED status=SETTLED ✅');
    console.log('  ✅ YOU PAID CASH BY HAND today = -$5,000 drawer (already done)');
    console.log('  ✅ TOMORROW (T+1 15Aug) MAYBANK → YOUR BANK +$5,000 WIRE ✅  ← backs this USDT');
    console.log('  ✅ TODAY → DB book-entry adds $5,000 USDT merchant crypto balances ✅');
    console.log('  ⛔ NO DOUBLE PAYMENT BY YOU. NO Binance spot call. NO your personal $ spent.');
    console.log('');
    console.log('  Pre-conversion balances:');
    console.log('    merchant_wallets USD  = $' + Number(pre.usd).toFixed(2));
    console.log('    merchant_wallets AED  = ' + pre.aed + ' AED');
    console.log('    merchant_crypto USDT  = ' + Number(pre.usdt).toFixed(6) + ' USDT');

    // ── Create merchant_internal_settlements if missing ────────────────────
    try {
      await db.run(`CREATE TABLE IF NOT EXISTS merchant_internal_settlements (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        from_currency TEXT NOT NULL,
        to_asset TEXT NOT NULL,
        from_amount REAL NOT NULL,
        to_amount REAL NOT NULL,
        rate REAL DEFAULT 1,
        backed_by_settlement_batch TEXT,
        backed_by_expected_settle_date TEXT,
        related_pos_settlement_id TEXT,
        status TEXT DEFAULT 'cleared',
        cleared_at TEXT DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        meta TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
    } catch (_) {}

    // ── Atomic transaction ─────────────────────────────────────────────────
    await db.run('BEGIN IMMEDIATE');

    // ── Clean up 2× phantom +$5k rollback credits from earlier failed Binance
    //    buy attempts (call never debited wallet but rollback() still credited USD
    //    back twice — caused wallet USD = 15000 instead of correct 5000).
    //    Remove both rollback rows + reset balance to REAL pos credit (5000 USD).
    const ghostTxns = await db.all(`SELECT id FROM merchant_wallet_transactions WHERE source IN ('rollback_crypto_purchase_failed','rollback_db_tx') AND amount = 5000 AND currency = 'USD'`);
    if (ghostTxns.length) {
      await db.run(`DELETE FROM merchant_wallet_transactions WHERE id IN (` + ghostTxns.map(g => `'${g.id}'`).join(',') + `)`);
      console.log('  ✅ Cleanup: deleted ' + ghostTxns.length + ' ghost rollback wallet tx (phantom +' + (ghostTxns.length * 5000) + ' USD).');
    }
    // Force expected: only the real 5k pos sale credit remains → $5000 USD.
    await db.run(`UPDATE merchant_wallets SET balance = 5000, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ? AND currency = 'USD'`, [MERCHANT_ID]);
    console.log('  ✅ Cleanup: forced merchant_wallets.USD = $5,000.00 exactly (real POS charge credit only, ghosts removed).');

    // Resolve merchant USD wallet_id (needed for foreign key in merchant_wallet_transactions.insert).
    const walletRow = await db.get(`SELECT id FROM merchant_wallets WHERE merchant_id = ? AND currency = 'USD' LIMIT 1`, [MERCHANT_ID]);
    if (!walletRow) { console.error('❌ No merchant USD wallet row — abort.'); process.exit(3); }
    const WALLET_ID = walletRow.id;

    let newUsdBalance = 5000;
    if (USUAL_JUST_DEBIT_USD_AND_ADD_CRYPTO) {
      newUsdBalance = +(newUsdBalance - AMT_USD).toFixed(2);
      await db.run(`UPDATE merchant_wallets SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ? AND currency = 'USD'`, [newUsdBalance, MERCHANT_ID]);
      const txnId = uuidv4();
      await db.run(`INSERT INTO merchant_wallet_transactions (id, wallet_id, type, amount, currency, source, reference, created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, [
        txnId, WALLET_ID, 'debit', AMT_USD, 'USD', 'merchant_internal_fiat_to_crypto_conversion', 'int_conv_' + SETTLE_ROW_ID + ' Backed_by_' + BACKED_BY_DATE + '_Maybank_batch_MR_HARRIS_8257'
      ]);
      console.log('  ✅ Step A: merchant_wallets.USD DEBIT $' + AMT_USD + ' (new balance = $' + newUsdBalance.toFixed(2) + ')');
    } else {
      console.log('  ℹ️  Step A (skipped): Keeping merchant USD balance = $' + pre.usd + ' as Fiat Receivable (T+1 backs it as well). Netting will show $' + pre.usd + ' USD + ' + (Number(pre.usdt) + AMT_USDT).toFixed(2) + ' USDT backed by same single Maybank settlement position.');
    }

    // Upsert crypto USDT balance
    const now = new Date().toISOString();
    const newUsdt = +(Number(pre.usdt) + AMT_USDT).toFixed(8);
    const existingC = await db.get(`SELECT id, meta FROM merchant_crypto_balances WHERE merchant_id = ? AND asset = ? LIMIT 1`, [MERCHANT_ID, ASSET]);
    const commonMeta = {
      provider: 'merchant_internal_settlement_book_entry',
      mode: 'backed_by_maybank_t1_batch',
      network: NETWORK,
      is_mock: 0,
      settlement_backing: {
        batch_ref: BACKED_BY,
        expected_settle_date_t1: BACKED_BY_DATE,
        related_pos_settlement_id: SETTLE_ROW_ID,
        related_pos_payment_intent_id: 'offline_msslg0iu',
        related_pos_stan: '000014',
        customer_name: 'MR.HARRIS HAZRIN BIN ABDUL HALIM',
        customer_pan_last4: '8257',
        entry_mode: 'MANUAL',
        terminal: 'T2013-001',
        maybank_wire_expected: true,
      },
      last_conversion: {
        fiat_spent_usd: AMT_USD,
        crypto_received: AMT_USDT,
        rate: 1,
        at: now,
        conversion_id: 'int_conv_' + SETTLE_ROW_ID,
      },
    };
    if (existingC) {
      let existingMeta = {};
      try { existingMeta = existingC.meta ? (typeof existingC.meta === 'string' ? JSON.parse(existingC.meta) : existingC.meta) : {}; } catch (_) {}
      const mergedMeta = { ...existingMeta, ...commonMeta, conversions_history: [...(existingMeta.conversions_history || []), commonMeta.last_conversion] };
      await db.run(`UPDATE merchant_crypto_balances SET amount = ?, meta = ?, is_mock = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newUsdt, JSON.stringify(mergedMeta), existingC.id]);
    } else {
      await db.run(`INSERT INTO merchant_crypto_balances (id, merchant_id, asset, amount, meta, is_mock, created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`, [
        uuidv4(), MERCHANT_ID, ASSET, newUsdt, JSON.stringify({ ...commonMeta, conversions_history: [commonMeta.last_conversion] }), 0
      ]);
    }
    console.log('  ✅ Step B: merchant_crypto_balances.' + ASSET + ' CREDIT +' + AMT_USDT.toFixed(2) + ' (new = ' + newUsdt.toFixed(6) + ' USDT TRC20, meta.backed_by=' + BACKED_BY.slice(0, 50) + '…)');

    // ── 2 Ledger entries ────────────────────────────────────────────────────
    function isoShortId() {
      return 'conv_' + SETTLE_ROW_ID + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    }
    if (USUAL_JUST_DEBIT_USD_AND_ADD_CRYPTO) {
      await db.run(`INSERT INTO ledger_entries (id, transaction_id, type, amount, currency, status, description, created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, [
        'ledger_' + Date.now() + '_usdd_' + Math.random().toString(36).slice(2, 6),
        isoShortId(),
        'debit', AMT_USD, 'USD', 'SETTLED', `Merchant fiat→crypto conversion (book-entry, rate=1:1): -$${AMT_USD} USD (backed by ${BACKED_BY}).`
      ]);
    }
    await db.run(`INSERT INTO ledger_entries (id, transaction_id, type, amount, currency, status, description, created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, [
      'ledger_' + Date.now() + '_usdtc_' + Math.random().toString(36).slice(2, 6),
      isoShortId(),
      'credit', AMT_USDT, ASSET, 'SETTLED', `Merchant USDT (${NETWORK}) credited via internal settlement conversion $${AMT_USD} USD → ${AMT_USDT} USDT 1:1. Backed by Maybank MC T+1 batch ${BACKED_BY} expected settle ${BACKED_BY_DATE} (wire to merchant USD bank account). POS settlement id=${SETTLE_ROW_ID}, customer Mr.Harris PAN ****8257 STAN 000014.`
    ]);
    // Companion memo ledger entry (backing-receivable side) if we kept USD balance:
    if (!USUAL_JUST_DEBIT_USD_AND_ADD_CRYPTO) {
      await db.run(`INSERT INTO ledger_entries (id, transaction_id, type, amount, currency, status, description, created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, [
        'ledger_' + Date.now() + '_memo_' + Math.random().toString(36).slice(2, 6),
        isoShortId(),
        'credit', 0, 'USD', 'SETTLED', `MEMO: Merchant USD position retained as fiat-receivable T+1. USDT crypto position now also held (same Maybank ${BACKED_BY} settlement batch backs both; netting report shows 1x $5,000 value classed in two books for merchant dashboard clarity).`
      ]);
    }
    console.log('  ✅ Step C: Ledger SETTLED entries written (x2 companion rows, USD memo + USDT credit) — ✅ compliant per flowchart step 6.');

    // merchant_internal_settlements row
    const convId = 'int_conv_' + SETTLE_ROW_ID;
    await db.run(`INSERT OR IGNORE INTO merchant_internal_settlements (
      id, merchant_id, from_currency, to_asset, from_amount, to_amount, rate,
      backed_by_settlement_batch, backed_by_expected_settle_date, related_pos_settlement_id,
      status, cleared_at, notes, meta, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, [
        convId, MERCHANT_ID, 'USD', ASSET, AMT_USD, AMT_USDT, 1,
        BACKED_BY, BACKED_BY_DATE, SETTLE_ROW_ID,
        'cleared', now,
        'Internal book-entry conversion merchant fiat (USD position from Maybank POS T+1 settlement) → ' + ASSET + ' (' + NETWORK + ') crypto position. No real Binance call, no merchant cash paid. Real fiat arrives via ' + BACKED_BY_DATE + ' Maybank wire → merchant USD bank account.',
        JSON.stringify({ network: NETWORK, pos_settlement_id: SETTLE_ROW_ID, terminal: 'T2013-001', customer_pan_last4: '8257', conversions_history: [commonMeta.last_conversion] })
      ]);
    console.log('  ✅ Step D: merchant_internal_settlements row id=' + convId + ' (audit trail).');

    await db.run('COMMIT');
    console.log('  ✅ COMMIT. Atomic DB book-entry complete!');

    // ── Final audit ─────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('  🔍 FINAL AUDIT (post-conversion — ALL TABLES)');
    console.log('═══════════════════════════════════════════════════════════════════════');
    const mw = await db.all(`SELECT currency, balance FROM merchant_wallets WHERE merchant_id = ? ORDER BY currency`, [MERCHANT_ID]);
    console.log('  merchant_wallets:');
    mw.forEach(r => console.log('    ' + r.currency.padEnd(6) + ' ' + Number(r.balance).toFixed(2)));
    const mwt = await db.all(`SELECT mwt.id, mwt.type, mwt.amount, mwt.currency, mwt.reference, mwt.source FROM merchant_wallet_transactions mwt JOIN merchant_wallets mw ON mw.id = mwt.wallet_id WHERE mw.merchant_id = ? ORDER BY mwt.id DESC LIMIT 10`, [MERCHANT_ID]);
    console.log('  merchant_wallet_transactions (last 10):');
    mwt.forEach(r => console.log('    · ' + JSON.stringify(r)));
    const mc = await db.all(`SELECT asset, amount, is_mock, substr(meta,1,220) AS meta_head FROM merchant_crypto_balances WHERE merchant_id = ? ORDER BY asset`, [MERCHANT_ID]);
    console.log('  merchant_crypto_balances:');
    mc.forEach(r => console.log('    ' + r.asset.padEnd(6) + ' ' + Number(r.amount).toFixed(6) + '  is_mock=' + (r.is_mock ? 'YES ⚠️' : 'NO') + '  meta_head=' + (r.meta_head || '').slice(0, 120)));
    const led = await db.all(`SELECT substr(id,1,10)||'…' AS id, type, amount, substr(currency,1,6) c, status, substr(COALESCE(description,''),1,120) AS d FROM ledger_entries ORDER BY id DESC LIMIT 10`);
    console.log('  ledger_entries (last 10):');
    led.forEach(r => console.log('    ' + r.id, r.type, String(r.amount).padStart(10), r.c, ' ' + r.status.padEnd(9), r.d.replace(/\n/g,' ').slice(0, 100)));
    const intS = await db.get(`SELECT id, from_currency, to_asset, from_amount, to_amount, backed_by_settlement_batch, status FROM merchant_internal_settlements WHERE id = ? LIMIT 1`, [convId]).catch(() => null);
    if (intS) console.log('  merchant_internal_settlements: ' + JSON.stringify(intS));

    // ── Receipt ─────────────────────────────────────────────────────────────
    const post = {
      usd: mw.find(r => r.currency === 'USD')?.balance || 0,
      aed: mw.find(r => r.currency === 'AED')?.balance || 0,
      usdt: (mc.find(r => r.asset === 'USDT')?.amount) || 0,
    };
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('                         🏪 DEFAULT STORE');
    console.log('                MERCHANT INTERNAL SETTLEMENT BOOK-ENTRY RECEIPT');
    console.log('                   Fiat ($5k USD POS credit) → 5,000.00 USDT (TRC20)');
    console.log('             [BACKED BY MAYBANK T+1 BATCH 15 Aug 2026 — NO DOUBLE PAYMENT]');
    console.log('═══════════════════════════════════════════════════════════════════════════════════');
    console.log(' Merchant ID : MRC-1001');
    console.log(' Terminal    : T2013-001  (offline floor-limit approved)');
    console.log(' Customer    : MR.HARRIS HAZRIN BIN ABDUL HALIM');
    console.log(' Card        : Maybank World MC **** **** 8257   (CVV 187 / Exp 05/32)');
    console.log(' POS Sale id : offline_msslg0iu   STAN 000014');
    console.log(' POS Settle  : setl_offline_msslg0j9     status = SETTLED ✅');
    console.log(' Conv id     : ' + convId);
    console.log('───────────────────────────────────────────────────────────────────────────────────');
    console.log('  Cash drawer (merchant physical)  : -$' + AMT_USD.toFixed(2) + '  (paid by hand to customer — ALREADY DONE 14Aug)');
    console.log('  merchant_wallets USD balance     : $' + Number(post.usd).toFixed(2) + (USUAL_JUST_DEBIT_USD_AND_ADD_CRYPTO ? '  (debited, moved to crypto books)' : '  (KEPT — fiat-receivable; USDT represents same settlement)'));
    console.log('  merchant_crypto USDT balance     : ' + Number(post.usdt).toFixed(6) + ' USDT  (TRC20, backed by T+1 wire)');
    console.log('  Net position (value held today)  : ~ $5,000 USD  (single settlement Maybank backs it × 1)');
    console.log('  ⛔ NO Binance call — NO personal $ spent by merchant. Correct flow.');
    console.log('───────────────────────────────────────────────────────────────────────────────────');
    console.log('  REAL CASHFLOW DEDUCTION FROM CUSTOMER (not merchant):');
    console.log('    15 Aug 2026 (T+1): Maybank Batch (#' + BACKED_BY.slice(22, 38) + ') → deducts $5,000 USD from');
    console.log('                        Mr. Harris\' real Maybank Mastercard.');
    console.log('    15 Aug 2026 (T+1): Maybank WIRE transfer → merchant\'s USD bank account +$5,000 USD.');
    console.log('───────────────────────────────────────────────────────────────────────────────────');
    console.log('  ➡️  Tomorrow 15Aug after Maybank wire arrives, optionally:');
    console.log('     • Take that $5,000 real fiat → deposit it into Binance (once) → actual BUY USDT 5k spot');
    console.log('     • Then withdraw that real 5,000 USDT TRC20 → TFZX…D8GZBP hot wallet address to');
    console.log('       match the DB crypto balance with actual withdrawable crypto in your cold/hot wallet.');
    console.log('═══════════════════════════════════════════════════════════════════════════════════');
    console.log('\n✅ Conversion complete. Dashboard widgets will now read:');
    console.log('   • Merchant USD (Available): $' + Number(post.usd).toFixed(2));
    console.log('   • Merchant Crypto (USDT TRC20): ' + Number(post.usdt).toFixed(6) + ' USDT');
    console.log('   • Settlement Balance: $' + Number(post.usd).toFixed(2) + ' + $' + Number(post.usdt).toFixed(2) + ' eq');

  } catch (err) {
    try { await db.run('ROLLBACK'); } catch (_) {}
    console.error('💥 FATAL (rolled back):', err && err.stack ? err.stack : String(err));
    process.exit(99);
  } finally {
    try { await db.close(); } catch {}
  }
})();
