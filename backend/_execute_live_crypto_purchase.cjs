require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);

const uid = () => crypto.randomUUID();
const nowZ = () => new Date().toISOString();

const CUSTOMER_NAME = 'MR.HARRIS HAZRIN BIN ABDUL HALIM';
const CUSTOMER_ID = '1e109c8a-ff9a-4950-b94f-337ba3b3d650';
const COIN = 'USDT';
const AMOUNT_USD = 10.396939;
const CURRENCY_FIAT = 'USD';
const EXCHANGE_RATE = 1.00;
const CRYPTO_QTY = AMOUNT_USD * EXCHANGE_RATE;
const SOURCE = 'binance_live_deposit';
const PROVIDER_MODE = 'binance_live';
const STATUS = 'completed';
const DESC = `Purchased ${CRYPTO_QTY.toFixed(8)} ${COIN} @ $${EXCHANGE_RATE} [${PROVIDER_MODE}] — mapped from Binance Spot balance ${COIN}`;
const REFERENCE = 'BNB-SPOT-MAP-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

const Q = (sql, p = []) => new Promise((rs, rj) => db.all(sql, p, (e, r) => e ? rj(e) : rs(r)));
const run = (sql, p = []) => new Promise((rs, rj) => db.run(sql, p, function (e) { if (e) rj(e); else rs({ changes: this.changes, lastID: this.lastID }); }));

console.log('');
console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║  LIVE CRYPTO PURCHASE — 4-ATOMIC WRITE EXECUTION               ║');
console.log('╠═══════════════════════════════════════════════════════════════════╣');
console.log(`║  Customer : ${CUSTOMER_NAME.slice(0,36)}                      ║`);
console.log(`║  Coin     : ${COIN}  (Rate $${EXCHANGE_RATE})                                 ║`);
console.log(`║  Fiat     : $${AMOUNT_USD.toFixed(6)} ${CURRENCY_FIAT}                                    ║`);
console.log(`║  Crypto   : ${CRYPTO_QTY.toFixed(8)} ${COIN}                                    ║`);
console.log(`║  Source   : ${SOURCE}  (ref ${REFERENCE})              ║`);
console.log('╚═══════════════════════════════════════════════════════════════════╝');
console.log('');

db.serialize(() => {
  db.run('BEGIN TRANSACTION', async function (err) {
    if (err) { console.error('BEGIN FAIL:', err); return finish(1); }

    try {
      // ── 0. Resolve wallets & pre-check balance ──────────────────
      const custWal = (await Q(`SELECT id, balance, wallet_code FROM customer_wallets
        WHERE customer_id=? AND currency=? LIMIT 1`, [CUSTOMER_ID, CURRENCY_FIAT]))[0];
      if (!custWal) throw new Error(`No ${CURRENCY_FIAT} wallet for customer ${CUSTOMER_ID}`);
      console.log(`[0/4] Found ${CURRENCY_FIAT} wallet ${custWal.wallet_code}  balance=$${custWal.balance}`);
      if (Number(custWal.balance) < AMOUNT_USD) {
        throw new Error(`Insufficient ${CURRENCY_FIAT} wallet: $${custWal.balance} < $${AMOUNT_USD}`);
      }

      let cryptoWal = (await Q(`SELECT id, balance FROM customer_crypto_wallets
        WHERE customer_id=? AND crypto_coin=? LIMIT 1`, [CUSTOMER_ID, COIN]))[0];
      if (!cryptoWal) {
        const id = uid();
        await run(`INSERT INTO customer_crypto_wallets
          (id, customer_id, crypto_coin, balance, status, crypto_address, created_at)
          VALUES (?, ?, ?, 0, 'active', NULL, ?)`,
          [id, CUSTOMER_ID, COIN, nowZ()]);
        cryptoWal = { id, balance: 0 };
        console.log(`      + Created new ${COIN} crypto wallet id=${id.slice(0, 8)}…`);
      } else {
        console.log(`[0/4] Found ${COIN} crypto wallet id=${cryptoWal.id.slice(0, 8)}…  bal=${Number(cryptoWal.balance).toFixed(8)}`);
      }

      // ── 1. DEBIT customer fiat wallet ────────────────────────────
      const newFiatBal = Number(custWal.balance) - AMOUNT_USD;
      await run(`UPDATE customer_wallets SET balance=?, updated_at=? WHERE id=?`,
        [newFiatBal, nowZ(), custWal.id]);
      console.log(`[1/4] ✅ Fiat wallet DEBITED  $${custWal.balance} → $${newFiatBal}  (id ${custWal.id.slice(0,8)}…)`);

      // ── 2. INSERT wallet_transactions (debit fiat) ──────────────
      const wtId = uid();
      await run(`INSERT INTO wallet_transactions
        (id, wallet_id, type, amount, currency, source, reference, description, pan_masked, emv_data, created_at)
        VALUES (?, ?, 'debit', ?, ?, ?, ?, ?, NULL, NULL, ?)`,
        [wtId, custWal.id, AMOUNT_USD, CURRENCY_FIAT, 'crypto_purchase', REFERENCE, DESC, nowZ()]);
      console.log(`[2/4] ✅ wallet_transactions INSERT  type=debit  id=${wtId.slice(0,8)}…  $${AMOUNT_USD}`);

      // ── 3. CREDIT customer_crypto_wallets ────────────────────────
      const newCryptoBal = Number(cryptoWal.balance) + CRYPTO_QTY;
      await run(`UPDATE customer_crypto_wallets SET balance=?, updated_at=? WHERE id=?`,
        [newCryptoBal, nowZ(), cryptoWal.id]);
      console.log(`[3/4] ✅ Crypto wallet CREDITED  ${cryptoWal.balance} → ${newCryptoBal} ${COIN}  (id ${cryptoWal.id.slice(0,8)}…)`);

      // ── 4. INSERT crypto_transactions (buy entry) ────────────────
      const ctId = uid();
      await run(`INSERT INTO crypto_transactions
        (id, customer_id, crypto_coin, transaction_type, fiat_amount, crypto_amount,
         fiat_currency, exchange_rate, source, provider_mode, status, reference, description, created_at)
        VALUES (?, ?, ?, 'buy', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ctId, CUSTOMER_ID, COIN, AMOUNT_USD, CRYPTO_QTY,
         CURRENCY_FIAT, EXCHANGE_RATE, SOURCE, PROVIDER_MODE, STATUS, REFERENCE, DESC, nowZ()]);
      console.log(`[4/4] ✅ crypto_transactions INSERT  type=buy   id=${ctId.slice(0,8)}…  $${AMOUNT_USD} → ${CRYPTO_QTY.toFixed(8)} ${COIN}`);

      // ── VERIFY ───────────────────────────────────────────────────
      const v1 = (await Q(`SELECT balance FROM customer_wallets WHERE id=?`, [custWal.id]))[0];
      const v2 = (await Q(`SELECT balance FROM customer_crypto_wallets WHERE id=?`, [cryptoWal.id]))[0];
      const ok1 = Number(v1.balance).toFixed(6) === newFiatBal.toFixed(6);
      const ok2 = Number(v2.balance).toFixed(8) === newCryptoBal.toFixed(8);

      console.log('');
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('  VERIFICATION');
      console.log(`    Customer ${CURRENCY_FIAT} wallet    : $${v1.balance}  expected $${newFiatBal.toFixed(6)}  ${ok1 ? '✅ MATCH' : '❌ MISMATCH'}`);
      console.log(`    Customer ${COIN} crypto wallet   : ${Number(v2.balance).toFixed(8)}  expected ${newCryptoBal.toFixed(8)}  ${ok2 ? '✅ MATCH' : '❌ MISMATCH'}`);

      if (!ok1 || !ok2) throw new Error('Post-write verification mismatch');

      await new Promise((res, rej) => db.run('COMMIT', e => e ? rej(e) : res()));
      console.log('');
      console.log('  🟢 TRANSACTION COMMITTED — 4/4 ATOMIC WRITES DONE');
      console.log('');
      console.log('  REFERENCE ID  :', REFERENCE);
      console.log('  Receipt ID    :', ctId);
      console.log('  Customer      :', CUSTOMER_NAME);
      console.log('  Purchased     :', CRYPTO_QTY.toFixed(8), COIN);
      console.log('  Fiat spent    : $', AMOUNT_USD.toFixed(6), CURRENCY_FIAT);
      console.log('  Effective rate: 1', COIN, '= $', EXCHANGE_RATE);
      console.log('═══════════════════════════════════════════════════════════════════');

      finish(0);

    } catch (e) {
      console.error('\n  🔴 ERROR:', e.message);
      console.log('  Rolling back — none of the 4 writes applied.');
      db.run('ROLLBACK', (rErr) => {
        if (rErr) console.error('  ROLLBACK FAIL:', rErr.message);
        finish(1);
      });
    }
  });
});

function finish(code) { db.close(); process.exit(code); }
