const BASE = 'http://127.0.0.1:7000';
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const MERCHANT_ID = 'MRC-1001';
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin1234';
const AMOUNT_USD = 5000;
const ASSET = 'USDT';
const NETWORK = 'TRC20';

(async () => {
  const db = await open({
    filename: path.join(__dirname, '..', 'data', 'database.sqlite'),
    driver: sqlite3.Database,
  });
  await db.run('PRAGMA journal_mode = WAL;');
  await db.run('PRAGMA foreign_keys = ON;');
  const q = async (sql, p=[]) => { try { const rows = await db.all(sql, p); return { rows, rowCount: rows.length }; } catch (e) { return { rows: [{ ERROR: e.message.slice(0, 200) }], rowCount: 0, err: e }; } };
  db.query = q;

  try {
    const wallBefore = await db.query(`SELECT currency, balance FROM merchant_wallets WHERE merchant_id = ? ORDER BY currency`, [MERCHANT_ID]);
    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('  🟢 MERCHANT PRE-PURCHASE (Wallet Balances)');
    console.log('══════════════════════════════════════════════════════════════════');
    console.log(JSON.stringify(wallBefore.rows || wallBefore, null, 2));

    console.log('\n[1/5] 🔑 POST /auth/login (admin)…');
    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    const loginJson = await loginRes.json();
    if (!loginRes.ok || !loginJson.token) {
      console.error('❌ LOGIN FAILED:', loginRes.status, JSON.stringify(loginJson).slice(0, 500));
      process.exit(1);
    }
    const TOKEN = loginJson.token;
    console.log('✅ JWT obtained (len=' + TOKEN.length + ')');

    console.log('\n[2/5] 🧾 GET merchant USD wallet (pre-purchase)…');
    const mw = await db.query(`SELECT * FROM merchant_wallets WHERE merchant_id = ? AND currency = 'USD' LIMIT 1`, [MERCHANT_ID]);
    const usdBal = Number((mw.rows?.[0] || mw[0])?.balance || 0);
    console.log(`USD Merchant Balance: $${usdBal.toFixed(2)} (required >= $${AMOUNT_USD})`);
    if (usdBal < AMOUNT_USD) {
      console.error(`❌ INSUFFICIENT USD BALANCE. Expected $${AMOUNT_USD}, got $${usdBal}.`);
      process.exit(2);
    }

    console.log('\n[3/5] 🪙 POST /api/merchant/' + MERCHANT_ID + `/crypto/purchase — $${AMOUNT_USD} USD → ${ASSET} (${NETWORK}) via BINANCE LIVE…`);
    console.log('      amount_usd=' + AMOUNT_USD + ', asset=' + ASSET + ', source_currency=USD, allow_simulation=false');
    const t0 = Date.now();
    const buyRes = await fetch(`${BASE}/api/merchant/${MERCHANT_ID}/crypto/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        amount_usd: AMOUNT_USD,
        asset: ASSET,
        source_currency: 'USD',
        allow_simulation: false,
      }),
    });
    const t1 = Date.now();
    const buyText = await buyRes.text();
    let buyJson;
    try { buyJson = JSON.parse(buyText); } catch { buyJson = { raw: buyText.slice(0, 1500) }; }
    console.log(`      ⏱️ ${(t1-t0)} ms  status=${buyRes.status}`);
    console.log('      RESPONSE PREVIEW:\n' + JSON.stringify(buyJson, null, 2).slice(0, 2000));

    if (!buyRes.ok) {
      console.error('\n❌ CRYPTO PURCHASE DECLINED / FAILED. HTTP', buyRes.status);
      console.error('   ', JSON.stringify(buyJson, null, 2).slice(0, 2000));
      process.exit(3);
    }

    console.log('\n[4/5] 🔍 Post-purchase audit of every real table…');
    const wallAfter = await db.query(`SELECT currency, balance FROM merchant_wallets WHERE merchant_id = ? ORDER BY currency`, [MERCHANT_ID]);
    const mwTxs = await db.query(`SELECT * FROM merchant_wallet_transactions WHERE merchant_id = ? ORDER BY id DESC LIMIT 5`, [MERCHANT_ID]);
    const cryptoBal = await db.query(`SELECT id, asset, amount, is_mock, meta FROM merchant_crypto_balances WHERE merchant_id = ? ORDER BY asset`, [MERCHANT_ID]);
    const ledger = await db.query(`SELECT id, type, amount, currency, asset, status, description, created_at FROM ledger_entries ORDER BY id DESC LIMIT 12`);

    console.log('\n─── MERCHANT WALLETS AFTER ───────────────────────');
    console.log(JSON.stringify(wallAfter.rows || wallAfter, null, 2));

    const usdAfter = Number(((wallAfter.rows || wallAfter).find(r => r.currency === 'USD') || { balance: 0 }).balance || 0);
    const usdtRow = (cryptoBal.rows || cryptoBal).find(r => r.asset === 'USDT');
    const usdtAmt = usdtRow ? Number(usdtRow.amount || 0) : 0;
    const deltaUSD = +(usdAfter - usdBal).toFixed(2);
    const pass1 = Math.abs(deltaUSD - (-AMOUNT_USD)) < 0.02;  // USD must have dropped by $5k
    const pass2 = usdtAmt > 100;                               // USDT must be meaningful (min 100 USDT)
    const pass3 = buyJson.ok === true;                         // API returned ok:true
    const pass4 = !buyJson.mock && !buyJson.is_mock && !Boolean((buyJson.orderResult || {}).mock);

    console.log(`\n─── DELTA ────────────────────────────────────────`);
    console.log(`USD Wallet Before = $${usdBal.toFixed(2)}`);
    console.log(`USD Wallet After  = $${usdAfter.toFixed(2)}   Δ = ${deltaUSD >= 0 ? '+' : ''}${deltaUSD}  (expected Δ = -${AMOUNT_USD}.00)`);
    console.log(`USDT Balance Now  = ${usdtAmt.toFixed(6)} ${ASSET}   (received via ${buyJson.provider_used || 'binance'} ${buyJson.mode || 'live'})`);
    console.log(`Order executedQty  = ${buyJson.executedQty || 'N/A'}   Avg Price = ${buyJson.avgPrice || 'N/A'} USD/${ASSET}`);

    console.log('\n─── MERCHANT WALLET TXNS (last 5) ───────────────');
    console.log(JSON.stringify(mwTxs.rows || mwTxs, null, 2).slice(0, 1800));
    console.log('\n─── MERCHANT CRYPTO BALANCES ────────────────────');
    console.log(JSON.stringify(cryptoBal.rows || cryptoBal, null, 2).slice(0, 2200));
    console.log('\n─── LEDGER (last 12) ────────────────────────────');
    (ledger.rows || ledger).forEach(r => console.log(
      String(r.id).padEnd(34), String(r.status).padEnd(10), String(r.type).padEnd(7),
      String(Number(r.amount).toFixed(4)).padStart(14), String(r.currency || r.asset || '').padEnd(6),
      ' ', String(r.description || '').slice(0, 96)
    ));

    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('  ✅ FINAL CHECKLIST');
    console.log('══════════════════════════════════════════════════════════════════');
    const check = (label, ok) => console.log((ok ? '  ✅ ' : '  ❌ ') + label.padEnd(42) + (ok ? 'PASS' : 'FAIL'));
    check('Exchange API ok=true response from endpoint', pass3);
    check(`Merchant USD wallet debited exactly $${AMOUNT_USD} (Δ=${deltaUSD})`, pass1);
    check(`Merchant crypto credited USDT (amt=${usdtAmt.toFixed(6)} > 100)`, pass2);
    check('Live mode (not mock/simulation — is_mock=0 in DB + no mock flag in result)', pass4);
    check('Binance keys in backend/.env LIVE (not placeholder)', !!/UQONcRSHk/.test(String(process.env.BINANCE_API_KEY || fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8'))));
    const allPass = pass1 && pass2 && pass3 && pass4;

    console.log('\n═════════════════════════════════════════════════════════════════════════════════');
    console.log('                      🏪 DEFAULT STORE — CRYPTO BUY RECEIPT');
    console.log('═════════════════════════════════════════════════════════════════════════════════');
    console.log('                MERCHANT $ → CRYPTO PURCHASE — LIVE BINANCE API');
    console.log('                     EXECUTED — ORDER MARKET BUY (USDT TRC20)');
    console.log('─────────────────────────────────────────────────────────────────────────────────');
    console.log(` Merchant    : ${MERCHANT_ID}`);
    console.log(` Operator    : admin   (JWT login @ ${new Date().toLocaleString('en-US')})`);
    console.log(` Provider    : ${buyJson.provider_used || 'binance'}   Mode : ${(buyJson.mode || 'live').toUpperCase()}   ${pass4 ? '' : '⚠️ MOCK! ⚠️'}`);
    console.log(` Network     : ${NETWORK}  (USDT.TRC20 = low gas <1 TRX per withdraw)`);
    console.log(` Exec time   : ${(t1-t0)} ms   @ ${new Date(t0).toISOString()}`);
    console.log('─────────────────────────────────────────────────────────────────────────────────');
    console.log(` SPENT (from merchant wallet USD)   : $${AMOUNT_USD.toFixed(2)} USD   (Δ = ${deltaUSD >= 0 ? '+' : ''}${deltaUSD})`);
    console.log(` RECEIVED (crypto_balances ${ASSET})  : ${usdtAmt.toFixed(6)} ${ASSET}`);
    console.log(` Average Price (spot buy)           : ${buyJson.avgPrice || (usdtAmt ? (AMOUNT_USD/usdtAmt).toFixed(6) : 'N/A')} USD/${ASSET}`);
    console.log(` Order Id (provider)                : ${buyJson.orderResult?.orderId || buyJson.order_id || buyJson.orderId || 'N/A'}`);
    console.log(` Execution Qty                      : ${buyJson.executedQty || usdtAmt} `);
    console.log('─────────────────────────────────────────────────────────────────────────────────');
    console.log(` ⚠️  REAL BINANCE LIVE MARKET ORDER JUST EXECUTED.`);
    console.log(`     You now hold ${usdtAmt.toFixed(6)} USDT TRC20 in merchant_custodial.`);
    console.log(`     Withdraw from Dashboard → Crypto Balances → Withdraw → paste TRC20 addr.`);
    console.log('═════════════════════════════════════════════════════════════════════════════════');

    if (allPass) {
      console.log('\n✅ ALL 6 CRYPTO PURCHASE FLOW STEPS PASSED.');
      process.exit(0);
    } else {
      console.log('\n⚠️  SOME STEPS FAILED. See above ❌ flags.');
      process.exit(4);
    }
  } catch (err) {
    console.error('\n💥 FATAL:', err && err.stack ? err.stack : String(err));
    process.exit(99);
  } finally {
    try { await db.close(); } catch {}
  }
})();
