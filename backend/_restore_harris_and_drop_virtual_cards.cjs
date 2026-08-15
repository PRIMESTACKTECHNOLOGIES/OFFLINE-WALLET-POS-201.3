const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );
const RUN = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    })
  );
const BEGIN = () => RUN('BEGIN IMMEDIATE');
const COMMIT = () => RUN('COMMIT');
const ROLLBACK = (e) => {
  try { db.run('ROLLBACK'); } catch (_) {}
  console.error('\nROLLBACK executed. Error:', e?.message || String(e));
  process.exitCode = 1;
};

const CUST_ID = '1e109c8a-ff9a-4950-b94f-337ba3b3d650';
const CARD_ID = '9aa10814-5246-4b94-9c24-b15bca6b584c';
const AMOUNT = 5000.0;
const CURRENCY = 'USD';

(async () => {
  console.log('============================================================');
  console.log('  STEP 1 — RESTORE MR.HARRIS $5,000 FROM VIRTUAL CARD → FIAT');
  console.log('============================================================\n');

  const cust = (await Q(`SELECT * FROM customers WHERE id=?`, [CUST_ID]))[0];
  if (!cust) { console.error('Customer not found'); process.exit(1); }
  const wallet = (await Q(`SELECT * FROM customer_wallets WHERE customer_id=? AND currency=?`, [CUST_ID, CURRENCY]))[0];
  if (!wallet) { console.error('USD wallet not found'); process.exit(1); }
  const card = (await Q(`SELECT * FROM virtual_cards WHERE id=? AND customer_id=? AND status='ACTIVE'`, [CARD_ID, CUST_ID]))[0];
  if (!card) {
    console.log('Virtual card row not present / not active. Skipping restore step.');
  } else {
    console.log(`  Before restore:`);
    console.log(`    · Fiat wallet bal  : $${Number(wallet.balance).toFixed(2)}`);
    console.log(`    · Virtual card bal : $${Number(card.balance).toFixed(2)}`);

    if (Number(card.balance) > 0) {
      try {
        await BEGIN();
        const restoreAmount = Math.min(Number(card.balance), AMOUNT);

        const r1 = await RUN(
          `UPDATE customer_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [restoreAmount, wallet.id]
        );
        console.log(`  ✓ customer_wallets +$${restoreAmount}  (${r1.changes} row)`);

        const r2 = await RUN(
          `UPDATE virtual_cards SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [restoreAmount, CARD_ID]
        );
        console.log(`  ✓ virtual_cards    −$${restoreAmount}  (${r2.changes} row)`);

        const txId = uuidv4();
        const r3 = await RUN(
          `INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, source, reference, description) VALUES (?, ?, 'credit', ?, ?, 'virtual_card_unload', ?, 'Restore trapped virtual card balance to spendable fiat wallet (virtual-card feature removal)')`,
          [txId, wallet.id, restoreAmount, CURRENCY, CARD_ID]
        );
        console.log(`  ✓ wallet_transactions credit row inserted (${r3.changes} row, id=${txId.slice(0,8)}…)`);

        await COMMIT();
        console.log(`  ✔ COMMIT OK — $${restoreAmount} restored successfully.\n`);
      } catch (e) {
        return ROLLBACK(e);
      }
    } else {
      console.log('  (card.balance is already $0.00 — no restore needed.)\n');
    }
  }

  console.log('============================================================');
  console.log('  STEP 2 — DELETE ALL VIRTUAL CARDS + DROP TABLE');
  console.log('============================================================\n');

  const cardCount = (await Q(`SELECT COUNT(*) c FROM virtual_cards`))[0].c;
  const cardSum = (await Q(`SELECT COALESCE(SUM(balance),0) s FROM virtual_cards`))[0].s;
  console.log(`  virtual_cards rows remaining : ${cardCount}`);
  console.log(`  virtual_cards balance total  : $${Number(cardSum).toFixed(2)}`);

  if (Number(cardSum) > 0.0001) {
    console.error('\n⚠  DANGER: virtual_cards still has balance $' + Number(cardSum).toFixed(2) + '. REFUSING TO DROP TABLE until all balances are restored.');
    console.error('   List of trapped cards:');
    const rows = await Q(`SELECT v.id, c.name customer, v.card_type, v.masked_number, v.balance, v.currency, v.status FROM virtual_cards v LEFT JOIN customers c ON c.id=v.customer_id WHERE v.balance > 0`);
    rows.forEach(r => console.log('    ·', JSON.stringify(r)));
    process.exit(1);
  }

  try {
    await BEGIN();
    await RUN(`DELETE FROM virtual_cards`);
    await RUN(`DROP TABLE IF EXISTS virtual_cards`);
    await COMMIT();
    console.log(`  ✔ All rows deleted + virtual_cards table DROPPED.\n`);
  } catch (e) {
    return ROLLBACK(e);
  }

  console.log('============================================================');
  console.log('  FINAL VERIFICATION');
  console.log('============================================================\n');

  const w = (await Q(`SELECT wallet_code, balance, currency, status FROM customer_wallets WHERE customer_id=? ORDER BY currency`, [CUST_ID]));
  w.forEach(ww => console.log(`  Wallet ${ww.wallet_code}  ${ww.currency}  bal=$${Number(ww.balance).toFixed(2)}  status=${ww.status}`));

  const vt = await Q(`SELECT t.created_at, t.type, printf('%.2f', t.amount) amt, t.currency, t.source, t.reference FROM wallet_transactions t WHERE t.wallet_id=? ORDER BY datetime(t.created_at) ASC`, [wallet.id]);
  console.log(`\n  Wallet ${wallet.wallet_code} transaction ledger:`);
  vt.forEach(t => console.log(`    ${String(t.created_at).replace('T',' ').slice(0,19)}  ${t.type.padEnd(7)}  $${t.amt} ${t.currency}  src=${t.source}  ref=${String(t.reference||'').slice(0,32)}`));

  try {
    const probe = await Q(`SELECT name FROM sqlite_master WHERE type='table' AND name='virtual_cards'`);
    console.log(`\n  virtual_cards table exists?  ${probe.length ? 'YES (FAIL)' : 'NO (correct)'}  ✓`);
  } catch(e) {
    console.log(`  virtual_cards table probe: SELECT error → good, table dropped permanently.`);
  }

  db.close();
  console.log('\nDone. Now proceed to remove virtual-card source code in backend + frontend.');
})().catch(e => { console.error(e); try{db.close();}catch(_){} process.exit(1); });
