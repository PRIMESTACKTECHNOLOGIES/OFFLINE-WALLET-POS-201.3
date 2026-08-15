const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const nowZ = () => new Date().toISOString();

const MERCHANT_WALLET_ID = '721e8788-0835-4ac9-800c-d2d968dc808a';
const CUSTOMER_WALLET_ID = '75215f42-964c-4ed3-ac8c-60a295278d8f';
const CUSTOMER_ID = '1e109c8a-ff9a-4950-b94f-337ba3b3d650';
const MERCHANT_ID = 'MRC-1001';
const AMOUNT = 5000;
const CURRENCY = 'USD';
const SOURCE = 'manual_adjustment';
const TXN_REF = 'txfr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

console.log('');
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  MERCHANT → CUSTOMER BALANCE TRANSFER                        ║');
console.log('╠═══════════════════════════════════════════════════════════════╣');
console.log(`║  FROM : Merchant ${MERCHANT_ID}  (wallet: ${MERCHANT_WALLET_ID.slice(0,8)}…)  ║`);
console.log(`║  TO   : MR.HARRIS HAZRIN  (wallet: ${CUSTOMER_WALLET_ID.slice(0,8)}…)   ║`);
console.log(`║  AMOUNT: $${AMOUNT.toFixed(2)} ${CURRENCY}                                    ║`);
console.log(`║  REF  : ${TXN_REF}    ║`);
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('');

db.serialize(() => {
  db.run('BEGIN TRANSACTION', function (err) {
    if (err) { console.error('BEGIN FAIL:', err); return finish(1); }

    const steps = [];
    const run = (sql, params = []) => new Promise((res, rej) => {
      db.run(sql, params, function (e) {
        if (e) rej(e); else res({ changes: this.changes, lastID: this.lastID });
      });
    });
    const get = (sql, p = []) => new Promise((res, rej) => {
      db.get(sql, p, (e, r) => e ? rej(e) : res(r));
    });

    (async () => {
      // 1. Pre-check balances
      const mBefore = await get(`SELECT balance FROM merchant_wallets WHERE id=?`, [MERCHANT_WALLET_ID]);
      const cBefore = await get(`SELECT balance FROM customer_wallets WHERE id=?`, [CUSTOMER_WALLET_ID]);
      console.log(`  Pre-check merchant balance : $${mBefore.balance} ${CURRENCY}`);
      console.log(`  Pre-check customer balance : $${cBefore.balance} ${CURRENCY}`);

      if (mBefore.balance < AMOUNT) {
        throw new Error(`INSUFFICIENT MERCHANT BALANCE: $${mBefore.balance} < $${AMOUNT}`);
      }

      // 2. Debit merchant wallet
      const newMBal = mBefore.balance - AMOUNT;
      await run(`UPDATE merchant_wallets SET balance=?, updated_at=? WHERE id=?`,
        [newMBal, nowZ(), MERCHANT_WALLET_ID]);
      console.log(`  ✓ Merchant wallet debited  : $${mBefore.balance} → $${newMBal}`);

      // 3. Credit customer wallet
      const newCBal = cBefore.balance + AMOUNT;
      await run(`UPDATE customer_wallets SET balance=?, updated_at=? WHERE id=?`,
        [newCBal, nowZ(), CUSTOMER_WALLET_ID]);
      console.log(`  ✓ Customer wallet credited : $${cBefore.balance} → $${newCBal}`);

      // 4. Insert merchant_wallet_transactions (DEBIT)
      const mwtId = uid();
      await run(`INSERT INTO merchant_wallet_transactions
        (id, wallet_id, type, amount, source, reference, created_at, currency)
        VALUES (?, ?, 'debit', ?, ?, ?, ?, ?)`,
        [mwtId, MERCHANT_WALLET_ID, AMOUNT, SOURCE, TXN_REF, nowZ(), CURRENCY]);
      console.log(`  ✓ Merchant tx log inserted (debit): id=${mwtId.slice(0,8)}…`);

      // 5. Insert wallet_transactions (CREDIT to customer)
      const wtId = uid();
      await run(`INSERT INTO wallet_transactions
        (id, wallet_id, type, amount, source, reference, description, pan_masked, emv_data, created_at, currency)
        VALUES (?, ?, 'credit', ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        [wtId, CUSTOMER_WALLET_ID, AMOUNT, SOURCE, TXN_REF,
          `Transfer from Merchant MRC-1001 [manual_adjustment]`, nowZ(), CURRENCY]);
      console.log(`  ✓ Customer tx log inserted (credit): id=${wtId.slice(0,8)}…`);

      // 6. Ledger entry — MERCHANT DEBIT (outflow)
      const ledDebitId = uid();
      const masterTxId = uid();
      await run(`INSERT INTO ledger_entries
        (id, transaction_id, type, amount, currency, status, description, created_at)
        VALUES (?, ?, 'debit', ?, ?, 'POSTED', ?, ?)`,
        [ledDebitId, masterTxId, AMOUNT, CURRENCY,
          `Merchant ${MERCHANT_ID} → Customer MR.HARRIS transfer [${TXN_REF}]`, nowZ()]);
      console.log(`  ✓ Ledger DEBIT entry  : id=${ledDebitId.slice(0,8)}…`);

      // 7. Ledger entry — CUSTOMER CREDIT (inflow)
      const ledCreditId = uid();
      await run(`INSERT INTO ledger_entries
        (id, transaction_id, type, amount, currency, status, description, created_at)
        VALUES (?, ?, 'credit', ?, ?, 'POSTED', ?, ?)`,
        [ledCreditId, masterTxId, AMOUNT, CURRENCY,
          `Customer MR.HARRIS received from Merchant ${MERCHANT_ID} [${TXN_REF}]`, nowZ()]);
      console.log(`  ✓ Ledger CREDIT entry : id=${ledCreditId.slice(0,8)}…`);

      // 8. Verify final balances
      const mAfter = await get(`SELECT balance FROM merchant_wallets WHERE id=?`, [MERCHANT_WALLET_ID]);
      const cAfter = await get(`SELECT balance FROM customer_wallets WHERE id=?`, [CUSTOMER_WALLET_ID]);

      console.log('');
      console.log('───────────────────────────────────────────────────────────────');
      console.log('  POST-TRANSFER VERIFICATION');
      console.log(`    Merchant MRC-1001 USD : $${mAfter.balance.toFixed(2)}  (expected ${newMBal.toFixed(2)})  ${mAfter.balance === newMBal ? '✓' : '✗ MISMATCH'}`);
      console.log(`    MR.HARRIS USD wallet  : $${cAfter.balance.toFixed(2)}  (expected ${newCBal.toFixed(2)})  ${cAfter.balance === newCBal ? '✓' : '✗ MISMATCH'}`);

      if (mAfter.balance !== newMBal || cAfter.balance !== newCBal) {
        throw new Error('Verification mismatch — rolling back');
      }

      // Commit
      await new Promise((res, rej) => db.run('COMMIT', e => e ? rej(e) : res()));
      console.log('');
      console.log('  ✅ TRANSACTION COMMITTED SUCCESSFULLY');
      console.log('');
      finish(0);

    })().catch(err => {
      console.error('\n  ❌ ERROR:', err.message);
      console.log('  Rolling back transaction...');
      db.run('ROLLBACK', (rErr) => {
        if (rErr) console.error('  ROLLBACK FAILED:', rErr.message);
        else console.log('  ROLLBACK completed — no balances changed.');
        finish(1);
      });
    });
  });
});

function finish(code) {
  db.close();
  process.exit(code);
}
