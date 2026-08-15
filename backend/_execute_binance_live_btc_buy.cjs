require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const axios = require('axios');

const cfg = {
  apiKey: process.env.BINANCE_API_KEY?.trim() || '',
  apiSecret: process.env.BINANCE_API_SECRET?.trim() || '',
  baseUrl: process.env.BINANCE_BASE_URL?.trim() || 'https://api.binance.com',
  merchantId: (process.env.DEFAULT_MERCHANT_ID || 'MRC-1001'),
};
const H = { 'X-MBX-APIKEY': cfg.apiKey };
let serverTimeOffset = null;
async function computeServerTimeOffset(retries = 3) {
  let lastErr = null;
  for (let i = 0; i < retries; i++) {
    try {
      const t0 = Date.now();
      const r = (await axios.get(`${cfg.baseUrl}/api/v3/time`, { timeout: 10000 })).data;
      const t1 = Date.now();
      const latency = (t1 - t0) / 2;
      const offset = Math.round(r.serverTime - (t0 + latency));
      serverTimeOffset = offset;
      console.log(`  [clock] offset = ${(offset >= 0 ? '+' : '')}${offset}ms  (local drift vs Binance server; lat ~${latency.toFixed(0)}ms)`);
      return offset;
    } catch (e) { lastErr = e; }
  }
  console.warn('  [clock] WARN: could not read /api/v3/time, using zero offset:', lastErr?.message);
  serverTimeOffset = 0;
  return 0;
}
function ts() { return Date.now() + (serverTimeOffset ?? 0); }
const sign = params => {
  const qs = new URLSearchParams(params).toString();
  return `${qs}&signature=${crypto.createHmac('sha256', cfg.apiSecret).update(qs).digest('hex')}`;
};
const POST = async (p, params = {}) => {
  const q = sign({ ...params, timestamp: ts(), recvWindow: 60000 });
  return (await axios.post(`${cfg.baseUrl}${p}?${q}`, undefined, { headers: H, timeout: 25000 })).data;
};
const GET = async (p, params = {}) => {
  const q = sign({ ...params, timestamp: ts(), recvWindow: 60000 });
  return (await axios.get(`${cfg.baseUrl}${p}?${q}`, { headers: H, timeout: 20000 })).data;
};

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (sql, p = []) => new Promise((rs, rj) => db.all(sql, p, (e, r) => e ? rj(e) : rs(r)));
const run = (sql, p = []) => new Promise((rs, rj) => db.run(sql, p, function (e) { if (e) rj(e); else rs({ changes: this.changes, lastID: this.lastID }); }));

const uid = () => crypto.randomUUID();
const nowZ = () => new Date().toISOString();

const SYMBOL = 'BTCUSDT';
const COIN = 'BTC';
const CURRENCY_FIAT = 'USD';
const SPEND_USDT = 10.396939;
const SIDE = 'BUY';
const TYPE = 'MARKET';
const REFERENCE = 'BNB-MARKET-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║  STEP 1/3 — BINANCE LIVE BTCUSDT MARKET BUY                    ║');
console.log(`╠═══════════════════════════════════════════════════════════════════╣`);
console.log(`║  Symbol   : ${SYMBOL}                                             ║`);
console.log(`║  Side     : ${SIDE}  (spend USDT → receive BTC)                  ║`);
console.log(`║  Type     : ${TYPE}  (immediate, no limit)                       ║`);
console.log(`║  USDT Qty : ${SPEND_USDT.toFixed(6)} (quoteOrderQty)                              ║`);
console.log(`║  Merchant : ${cfg.merchantId} (PRIMESTACK)                    ║`);
console.log(`║  Reference: ${REFERENCE}      ║`);
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

(async () => {
  await computeServerTimeOffset();

  // ── 0. Pre-check: balance snapshot before ──────────────────
  const acc0 = await GET('/api/v3/account');
  const usdt0 = Number((acc0.balances || []).find(b => b.asset === 'USDT')?.free || 0);
  const btc0 = Number((acc0.balances || []).find(b => b.asset === 'BTC')?.free || 0);
  console.log(`[pre] Binance USDT free  : ${usdt0.toFixed(6)}`);
  console.log(`[pre] Binance BTC free   : ${btc0.toFixed(8)}`);
  if (usdt0 < SPEND_USDT * 0.999) {
    throw new Error(`Not enough USDT: have $${usdt0}, need $${SPEND_USDT}. Abort — no order submitted.`);
  }

  // ── 1. SUBMIT REAL BINANCE MARKET BUY ORDER ────────────────
  console.log(`\n>>> POST /api/v3/order (${SYMBOL} ${SIDE} ${TYPE} quoteOrderQty=${SPEND_USDT})`);
  let order;
  try {
    order = await POST('/api/v3/order', {
      symbol: SYMBOL, side: SIDE, type: TYPE,
      quoteOrderQty: SPEND_USDT.toFixed(6),
      newOrderRespType: 'FULL',  // get fills immediately for MARKET
      recvWindow: 30000,
    });
  } catch (e) {
    console.error('  ✖ Binance order REJECTED:', e.response?.status, JSON.stringify(e.response?.data || e.message));
    console.error('  NO DB writes made — safe to retry.');
    process.exit(1);
  }
  console.log(`  ✔ OrderId=${order.orderId}  clientOrderId=${order.clientOrderId}  status=${order.status}`);
  console.log(`    transactTime=${new Date(order.transactTime).toISOString()}  timeInForce=${order.timeInForce}`);

  const grossQty = Number(order.executedQty);  // BTC received
  const grossSpentUSDT = Number(order.cummulativeQuoteQty);
  const avgPrice = grossQty > 0 ? grossSpentUSDT / grossQty : Number(order.fills?.[0]?.price || 0);
  const feeTotal = (order.fills || []).reduce((s, f) => s + Number(f.commission), 0);
  const feeAsset = (order.fills || [])[0]?.commissionAsset || 'BTC';
  const netBTC = grossQty - (feeAsset === COIN ? feeTotal : 0); // BTC net to our holding

  console.log('');
  console.log('══════════════════ FILL DETAIL (live exchange result) ══════════════════');
  console.log(`  BTC received (gross) : ${grossQty.toFixed(8)} BTC`);
  console.log(`  USDT paid (gross)    : ${grossSpentUSDT.toFixed(6)} USDT`);
  console.log(`  Avg execution price  : ${avgPrice.toFixed(2)} USDT/BTC`);
  console.log(`  Fills                : ${(order.fills||[]).length}`);
  (order.fills||[]).forEach((f,i) => console.log(`     #${i}  price=${Number(f.price).toFixed(2)}  qty=${Number(f.qty).toFixed(8)}  fee=${Number(f.commission).toFixed(8)} ${f.commissionAsset}`));
  console.log(`  Total commission     : ${feeTotal.toFixed(8)} ${feeAsset}`);
  console.log(`  Net BTC credited     : ${netBTC.toFixed(8)} BTC`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // ── 2. Post-exchange balance snapshot ──────────────────────
  const acc1 = await GET('/api/v3/account');
  const usdt1 = Number((acc1.balances || []).find(b => b.asset === 'USDT')?.free || 0);
  const btc1 = Number((acc1.balances || []).find(b => b.asset === 'BTC')?.free || 0);
  const usdtDelta = (usdt0 - usdt1).toFixed(6);
  const btcDelta = (btc1 - btc0).toFixed(8);
  console.log(`[post] Binance USDT : ${usdt1.toFixed(6)}  (Δ -${usdtDelta} = expected ~${SPEND_USDT.toFixed(6)})`);
  console.log(`[post] Binance BTC  : ${btc1.toFixed(8)}  (Δ +${btcDelta})`);
  if (Math.abs(Number(usdtDelta) - grossSpentUSDT) > 0.05) {
    console.log(`  ⚠ USDT movement mismatch — expected -${grossSpentUSDT.toFixed(6)}, got -${usdtDelta}. Continuing anyway (funds may have moved elsewhere).`);
  }

  // ── 3. 4-ATOMIC DB WRITES (merchant → merchant crypto vault) ───
  console.log('');
  console.log('═══ STEP 2/3 — DB 4-ATOMIC WRITE (Merchant MRC-1001) ═══\n');
  const FIAT_SPENT = grossSpentUSDT;  // match actual USDT paid
  const EXCHANGE_RATE = avgPrice;
  const NET_BTC = netBTC;
  const DESC = `Live Binance MARKET BUY ${SYMBOL} — spent ${grossSpentUSDT.toFixed(6)} USDT → received ${NET_BTC.toFixed(8)} BTC avg ${avgPrice.toFixed(2)}  orderId=${order.orderId}  fills=${(order.fills||[]).length}`;

  await new Promise((rs, rj) => db.run('BEGIN TRANSACTION', async e => {
    if (e) return rj(e);
    try {
      // 3a. Source merchant fiat wallet
      const mw = (await Q(`SELECT id, balance, wallet_code FROM merchant_wallets
        WHERE merchant_id=? AND currency=? LIMIT 1`, [cfg.merchantId, CURRENCY_FIAT]))[0];
      if (!mw) throw new Error(`No ${CURRENCY_FIAT} merchant wallet for ${cfg.merchantId}`);
      console.log(`[0/4] Merchant fiat wallet ${mw.wallet_code}  bal=$${mw.balance}`);
      if (Number(mw.balance) < FIAT_SPENT) throw new Error(`Merchant wallet $${mw.balance} < cost $${FIAT_SPENT.toFixed(2)}`);
      const newFiatBal = Number(mw.balance) - FIAT_SPENT;

      // 3b. Ensure merchant_crypto_balances table & row exist
      const tables = await Q(`SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_crypto_balances'`);
      if (tables.length === 0) {
        await run(`CREATE TABLE merchant_crypto_balances (
          id TEXT PRIMARY KEY,
          merchant_id TEXT NOT NULL,
          crypto_coin TEXT NOT NULL,
          balance REAL NOT NULL DEFAULT 0,
          status TEXT DEFAULT 'active',
          address TEXT,
          created_at TEXT,
          updated_at TEXT,
          UNIQUE(merchant_id, crypto_coin)
        )`);
        console.log('      + Created missing merchant_crypto_balances table');
      }
      let mcb = (await Q(`SELECT id, balance FROM merchant_crypto_balances
        WHERE merchant_id=? AND crypto_coin=? LIMIT 1`, [cfg.merchantId, COIN]))[0];
      if (!mcb) {
        const id = uid();
        await run(`INSERT INTO merchant_crypto_balances
          (id, merchant_id, crypto_coin, balance, status, created_at) VALUES (?,?,?,0,'active',?)`,
          [id, cfg.merchantId, COIN, nowZ()]);
        mcb = { id, balance: 0 };
        console.log(`      + Created merchant crypto vault row ${id.slice(0,8)}…`);
      }
      console.log(`[0/4] Merchant crypto vault id=${mcb.id.slice(0,8)}…  ${COIN} bal=${Number(mcb.balance).toFixed(8)}`);

      // WRITE 1 — debit merchant_wallets
      await run(`UPDATE merchant_wallets SET balance=?, updated_at=? WHERE id=?`,
        [newFiatBal, nowZ(), mw.id]);
      console.log(`[1/4] ✅ merchant_wallets DEBIT  $${mw.balance} → $${newFiatBal.toFixed(6)}`);

      // WRITE 2 — merchant_wallet_transactions debit row
      const mwtId = uid();
      await run(`INSERT INTO merchant_wallet_transactions
        (id, merchant_wallet_id, transaction_type, amount, currency, status, reference, description, created_at)
        VALUES (?, ?, 'debit', ?, ?, 'completed', ?, ?, ?)`,
        [mwtId, mw.id, FIAT_SPENT, CURRENCY_FIAT, REFERENCE + '/orderId:' + order.orderId, DESC, nowZ()]);
      console.log(`[2/4] ✅ merchant_wallet_transactions INSERT  type=debit  $${FIAT_SPENT.toFixed(6)}  id=${mwtId.slice(0,8)}…`);

      // WRITE 3 — credit merchant_crypto_balances
      const newBal = Number(mcb.balance) + NET_BTC;
      await run(`UPDATE merchant_crypto_balances SET balance=?, updated_at=? WHERE id=?`,
        [newBal, nowZ(), mcb.id]);
      console.log(`[3/4] ✅ merchant_crypto_balances CREDIT  ${mcb.balance} → ${newBal.toFixed(8)} ${COIN}`);

      // WRITE 4 — crypto_transactions (merchant-owned buy row)
      const ctId = uid();
      await run(`INSERT INTO crypto_transactions
        (id, customer_id, crypto_coin, transaction_type, fiat_amount, crypto_amount,
         fiat_currency, exchange_rate, source, provider_mode, status, reference, description,
         merchant_id, exchange_order_id, fill_count, fee_amount, fee_coin, created_at)
        VALUES (?, NULL, ?, 'buy', ?, ?, ?, ?, 'binance_spot', 'binance_live', 'completed',
                ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ctId, COIN, FIAT_SPENT, NET_BTC, CURRENCY_FIAT, EXCHANGE_RATE, REFERENCE, DESC,
         cfg.merchantId, String(order.orderId), (order.fills||[]).length, feeTotal, feeAsset, nowZ()]);
      console.log(`[4/4] ✅ crypto_transactions INSERT  merchant buy  $${FIAT_SPENT.toFixed(6)} → ${NET_BTC.toFixed(8)} ${COIN}  id=${ctId.slice(0,8)}…`);

      // Verification
      const v1 = (await Q(`SELECT balance FROM merchant_wallets WHERE id=?`, [mw.id]))[0];
      const v2 = (await Q(`SELECT balance FROM merchant_crypto_balances WHERE id=?`, [mcb.id]))[0];
      const ok1 = Number(v1.balance).toFixed(6) === newFiatBal.toFixed(6);
      const ok2 = Number(v2.balance).toFixed(8) === newBal.toFixed(8);
      console.log('');
      console.log('── VERIFY ──');
      console.log(`  Merchant USD  : $${v1.balance}  expected $${newFiatBal.toFixed(6)}  ${ok1 ? '✅' : '❌ MISMATCH'}`);
      console.log(`  Merchant BTC  : ${Number(v2.balance).toFixed(8)}  expected ${newBal.toFixed(8)}  ${ok2 ? '✅' : '❌ MISMATCH'}`);
      if (!ok1 || !ok2) throw new Error('Verify failed');

      await new Promise((res, rej) => db.run('COMMIT', e => e ? rej(e) : res()));
      console.log('\n  🟢 DB COMMIT OK — 4/4 atomic writes applied.');

      // ── 4. FINAL RECEIPT ───────────────────────────────────
      console.log('');
      console.log('╔═══════════════════════════════════════════════════════════════════╗');
      console.log('║  🔐 OFFICIAL RECEIPT — LIVE BINANCE BTC PURCHASE                ║');
      console.log('╠═══════════════════════════════════════════════════════════════════╣');
      console.log(`║  Order Ref    : ${REFERENCE}                         ║`);
      console.log(`║  Binance ID   : ${order.orderId}                                             ║`);
      console.log(`║  Merchant     : ${cfg.merchantId} (PRIMESTACK TECHNOLOGIES LLC)  ║`);
      console.log(`║  Date (UTC)   : ${new Date(order.transactTime).toISOString()}                  ║`);
      console.log(`║  Pair         : ${SYMBOL}                                                 ║`);
      console.log(`║  Side/Type    : ${SIDE} ${TYPE}                                             ║`);
      console.log(`╠───────────────────────────────────────────────────────────────────╣`);
      console.log(`║  USDT Paid    : $${grossSpentUSDT.toFixed(6).padEnd(38)}    ║`);
      console.log(`║  Avg Price    : $${avgPrice.toFixed(2).padEnd(26)}/BTC                ║`);
      console.log(`║  BTC Received : ${NET_BTC.toFixed(8).padEnd(40)} ${COIN}    ║`);
      console.log(`║  Fills Count  : ${String((order.fills||[]).length).padEnd(48)}    ║`);
      console.log(`║  Commission   : ${feeTotal.toFixed(8).padEnd(39)} ${feeAsset}    ║`);
      console.log(`╠───────────────────────────────────────────────────────────────────╣`);
      console.log(`║  DB: Merchant USD $${mw.balance} → $${newFiatBal.toFixed(2)}  (-$${FIAT_SPENT.toFixed(2)})              ║`);
      console.log(`║  DB: Merchant BTC ${Number(mcb.balance).toFixed(8)} → ${newBal.toFixed(8)} (+${NET_BTC.toFixed(8)})           ║`);
      console.log(`╚═══════════════════════════════════════════════════════════════════╝`);

      db.close(); process.exit(0);
    } catch (err) {
      console.error('\n  🔴 DB ERROR:', err.message);
      console.log('  ⚠  BINANCE ORDER ALREADY EXECUTED above — you need to MANUALLY reconcile!');
      console.log('     Order was submitted & filled on Binance. DB writes rolled back locally only.');
      console.log('     Binance now has less USDT & more BTC; to match, re-run DB-only script OR manually fix entries.');
      db.run('ROLLBACK', re => { if (re) console.error('ROLLBACK FAIL:', re.message); db.close(); process.exit(2); });
    }
  }));
})().catch(err => {
  console.error('\n💥 UNHANDLED:', err.message);
  if (err.response) console.error('   HTTP', err.response.status, JSON.stringify(err.response.data).slice(0, 600));
  db.close(); process.exit(1);
});
