require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const axios = require('axios');

const cfg = {
  apiKey: process.env.BINANCE_API_KEY?.trim() || '',
  apiSecret: process.env.BINANCE_API_SECRET?.trim() || '',
  baseUrl: process.env.BINANCE_BASE_URL?.trim() || 'https://api.binance.com',
  merchantId: process.env.DEFAULT_MERCHANT_ID || 'MRC-1001',
};
const H = { 'X-MBX-APIKEY': cfg.apiKey };

let serverTimeOffset = null;
async function computeServerTimeOffset(r = 3) {
  let last = null;
  for (let i = 0; i < r; i++) {
    try {
      const t0 = Date.now();
      const s = (await axios.get(`${cfg.baseUrl}/api/v3/time`, { timeout: 10000 })).data.serverTime;
      const t1 = Date.now();
      serverTimeOffset = Math.round(s - ((t0 + t1) / 2));
      console.log(`  [clock] offset ${serverTimeOffset >= 0 ? '+' : ''}${serverTimeOffset}ms  lat ~${((t1 - t0) / 2).toFixed(0)}ms`);
      return;
    } catch (e) { last = e; }
  }
  console.warn('  [clock] warn:', last?.message);
  serverTimeOffset = 0;
}
const ts = () => Date.now() + (serverTimeOffset ?? 0);
const sign = (params) => {
  const qs = new URLSearchParams(params).toString();
  return `${qs}&signature=${crypto.createHmac('sha256', cfg.apiSecret).update(qs).digest('hex')}`;
};
const GET = async (p, params = {}) =>
  (await axios.get(`${cfg.baseUrl}${p}?${sign({ ...params, timestamp: ts(), recvWindow: 60000 })}`, { headers: H, timeout: 20000 })).data;
const GETPUB = async (p) => (await axios.get(`${cfg.baseUrl}${p}`, { timeout: 10000 })).data;

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (s, p = []) => new Promise((rs, rj) => db.all(s, p, (e, r) => e ? rj(e) : rs(r)));
const run = (s, p = []) => new Promise((rs, rj) => db.run(s, p, function (e) { if (e) rj(e); else rs({ changes: this.changes, lastID: this.lastID }); }));

const uid = () => crypto.randomUUID();
const nowZ = () => new Date().toISOString();

const ORDER = {
  orderId: 65286725613,
  clientOrderId: 'bPFBANu5E00v1p3oIIyv63',
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'MARKET',
  transactTime: 1786378417202,
  executedQty: 0.00016000,
  cummulativeQuoteQty: 10.238334,
  fills: [{ price: 63989.59, qty: 0.00016000, commission: 0.00000016, commissionAsset: 'BTC', tradeId: -1 }],
};
const COIN = 'BTC';
const FIAT_CUR = 'USD';
const SPENT = ORDER.cummulativeQuoteQty;
const FEE = ORDER.fills.reduce((s, f) => s + Number(f.commission), 0);
const FEE_COIN = ORDER.fills[0].commissionAsset;
const NET_QTY = ORDER.executedQty - (FEE_COIN === COIN ? FEE : 0);
const AVG = ORDER.cummulativeQuoteQty / ORDER.executedQty;
const REF = 'BNB-LIVE-65286725613-RECON';
const DESC = `Live Binance MARKET BUY orderId=${ORDER.orderId} (${ORDER.symbol}) — spent ${SPENT.toFixed(6)} USDT → received ${NET_QTY.toFixed(8)} ${COIN} @ ${AVG.toFixed(2)}  fills=${ORDER.fills.length}  fee=${FEE.toFixed(8)} ${FEE_COIN}  [DB reconciliation]`;
const OWNER_ID = cfg.merchantId;   // MRC-1001 goes into customer_id column (existing pattern)

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  RECONCILE BINANCE LIVE BTC PURCHASE  orderId=${ORDER.orderId}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  await computeServerTimeOffset();
  const acc = await GET('/api/v3/account');
  const usdtNow = Number((acc.balances || []).find(b => b.asset === 'USDT')?.free || 0);
  const btcNow = Number((acc.balances || []).find(b => b.asset === 'BTC')?.free || 0);
  const mark = Number((await GETPUB('/api/v3/ticker/price?symbol=BTCUSDT')).price || 0);

  console.log(`  Binance USDT free: ${usdtNow.toFixed(6)}  |  BTC free: ${btcNow.toFixed(8)}  |  BTC mark: $${mark.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n`);

  if (btcNow < 0.0001) { console.error('  ❌ BINANCE BTC balance is 0 — ORDER NOT FILLED? ABORT DB WRITE.'); process.exit(3); }

  // Resolve MERCHANT wallet
  const mw = (await Q(`SELECT id, merchant_id, currency, balance FROM merchant_wallets WHERE merchant_id=? AND currency=? LIMIT 1`, [cfg.merchantId, FIAT_CUR]))[0];
  if (!mw) throw new Error(`No ${FIAT_CUR} merchant_wallets row for ${cfg.merchantId}`);
  console.log(`[0/4] merchant_wallets  id=${mw.id}  ${mw.currency}  balance=$${mw.balance}  (need $${SPENT.toFixed(6)})`);
  if (Number(mw.balance) < SPENT) {
    console.error(`  ❌ INSUFFICIENT: merchant_wallets.balance $${mw.balance} < $${SPENT.toFixed(6)}. Abort.`);
    process.exit(4);
  }
  const NEW_FIAT = Number(mw.balance) - SPENT;

  // Resolve / CREATE customer_crypto_wallets BTC row (owner=MRC-1001 since that's how merchant cryptos are stored)
  let ccw = (await Q(`SELECT id, customer_id, crypto_coin, balance, status FROM customer_crypto_wallets
    WHERE customer_id=? AND crypto_coin=? LIMIT 1`, [OWNER_ID, COIN]))[0];
  if (!ccw) {
    const id = uid();
    await run(`INSERT INTO customer_crypto_wallets (id, customer_id, crypto_coin, balance, status, created_at)
      VALUES (?,?,?,0,'active',?)`, [id, OWNER_ID, COIN, nowZ()]);
    ccw = { id, balance: 0, status: 'active' };
    console.log(`      + created new customer_crypto_wallets BTC row (customer_id=MRC-1001) id=${id.slice(0, 8)}…`);
  }
  console.log(`[0/4] customer_crypto_wallets  id=${ccw.id.slice(0,8)}…  ${COIN}  balance=${Number(ccw.balance).toFixed(8)}`);
  const NEW_CRYPTO = Number(ccw.balance) + NET_QTY;

  // ──────── START 4-ATOMIC-WRITE TX ────────
  await new Promise((RES, REJ) => db.run('BEGIN TRANSACTION', async e => {
    if (e) return REJ(e);
    try {
      // 1. DEBIT merchant_wallets
      await run(`UPDATE merchant_wallets SET balance=?, updated_at=? WHERE id=?`, [NEW_FIAT, nowZ(), mw.id]);
      console.log(`[1/4] ✅ merchant_wallets DEBIT  $${mw.balance} → $${NEW_FIAT.toFixed(6)}  (-$${SPENT.toFixed(6)})`);

      // 2. INSERT merchant_wallet_transactions (type/debit/source/reference)
      const mwt_id = uid();
      await run(`INSERT INTO merchant_wallet_transactions (id, wallet_id, type, amount, source, reference, currency, created_at)
        VALUES (?, ?, 'debit', ?, 'crypto_purchase', ?, ?, ?)`,
        [mwt_id, mw.id, SPENT, REF + '/orderId:' + ORDER.orderId, FIAT_CUR, nowZ()]);
      console.log(`[2/4] ✅ merchant_wallet_transactions INSERT  id=${mwt_id.slice(0, 8)}…  type=debit $${SPENT.toFixed(6)} ${FIAT_CUR}`);

      // 3. CREDIT customer_crypto_wallets (MERCHANT-owned vault — per existing pattern MRC-1001 in customer_id)
      await run(`UPDATE customer_crypto_wallets SET balance=?, updated_at=? WHERE id=?`, [NEW_CRYPTO, nowZ(), ccw.id]);
      console.log(`[3/4] ✅ customer_crypto_wallets CREDIT  ${Number(ccw.balance).toFixed(8)} → ${NEW_CRYPTO.toFixed(8)} ${COIN}  (+${NET_QTY.toFixed(8)})`);

      // 4. INSERT crypto_transactions — exact 14 columns from PRAGMA table_info()
      const ct_id = uid();
      await run(`INSERT INTO crypto_transactions
        (id, customer_id, crypto_coin, transaction_type, fiat_amount, crypto_amount,
         fiat_currency, exchange_rate, source, reference, tx_hash, status, provider_mode, created_at)
        VALUES (?, ?, ?, 'buy', ?, ?, 'USD', ?, ?, ?, NULL, 'completed', 'binance_live', ?)`,
        [ct_id, OWNER_ID, COIN, SPENT, NET_QTY, AVG, 'binance_spot_market', REF + ' / orderId:' + ORDER.orderId + ' / clientOrderId:' + ORDER.clientOrderId, nowZ()]);
      console.log(`[4/4] ✅ crypto_transactions INSERT  id=${ct_id.slice(0, 8)}…  $${SPENT.toFixed(6)} → ${NET_QTY.toFixed(8)} ${COIN}  rate=$${AVG.toFixed(2)}/${COIN}`);

      // VERIFY
      const v1 = (await Q(`SELECT balance FROM merchant_wallets WHERE id=?`, [mw.id]))[0];
      const v2 = (await Q(`SELECT balance FROM customer_crypto_wallets WHERE id=?`, [ccw.id]))[0];
      const ok1 = Number(v1.balance).toFixed(6) === NEW_FIAT.toFixed(6);
      const ok2 = Number(v2.balance).toFixed(8) === NEW_CRYPTO.toFixed(8);
      console.log('\n── VERIFY ──');
      console.log(`  merchant_wallets.USD.balance  = $${v1.balance}   expected $${NEW_FIAT.toFixed(6)}   ${ok1 ? '✅' : '❌ MISMATCH'}`);
      console.log(`  cust_crypto_wallets.MRC1001.BTC = ${Number(v2.balance).toFixed(8)}   expected ${NEW_CRYPTO.toFixed(8)}   ${ok2 ? '✅' : '❌ MISMATCH'}`);
      if (!ok1 || !ok2) throw new Error('verify mismatch');

      await new Promise((res, rej) => db.run('COMMIT', e => e ? rej(e) : res()));
      console.log('\n  🟢 COMMIT — 4/4 ATOMIC WRITES APPLIED. Recon complete.\n');

      // RECEIPT
      console.log('╔═══════════════════════════════════════════════════════════════════╗');
      console.log('║  🔐 LIVE BINANCE BTC PURCHASE — FULL RECEIPT                    ║');
      console.log('╠═══════════════════════════════════════════════════════════════════╣');
      console.log(`║  Reference   : ${REF}                            ║`);
      console.log(`║  Binance ID  : ${ORDER.orderId}  (clientOrder ${ORDER.clientOrderId.slice(0,10)}…)  ║`);
      console.log(`║  Owner       : ${OWNER_ID} (PRIMESTACK TECHNOLOGIES LLC)         ║`);
      console.log(`║  Time (UTC)  : ${new Date(ORDER.transactTime).toISOString()}                  ║`);
      console.log(`║  Pair        : ${ORDER.symbol}  Side=BUY  Type=MARKET                            ║`);
      console.log('╠───────────────────────────────────────────────────────────────────╣');
      console.log(`║  USDT Spent  : $${SPENT.toFixed(6).padEnd(48)}     ║`);
      console.log(`║  Avg Price   : $${AVG.toFixed(2).padEnd(44)}/${COIN}    ║`);
      console.log(`║  ${COIN} Received : ${NET_QTY.toFixed(8).padEnd(50)} ${COIN}    ║`);
      console.log(`║  Fills       : ${String(ORDER.fills.length).padEnd(56)}     ║`);
      console.log(`║  Commission  : ${FEE.toFixed(8).padEnd(47)} ${FEE_COIN}    ║`);
      console.log(`║  Mode        : binance_live (real exchange, not internal)           ║`);
      console.log('╠───────────────────────────────────────────────────────────────────╣');
      console.log(`║  Binance: BTC balance NOW = ${btcNow.toFixed(8).padEnd(34)} (~$${(btcNow * mark).toFixed(2)}) ║`);
      console.log(`║  Binance: USDT balance     = ${usdtNow.toFixed(6).padEnd(44)}     ║`);
      console.log('╠───────────────────────────────────────────────────────────────────╣');
      console.log(`║  DB: Merchant USD         : $${String(mw.balance).padStart(10)} → $${NEW_FIAT.toFixed(2)}  (-$${SPENT.toFixed(2)})          ║`);
      console.log(`║  DB: Merchant BTC vault   : ${Number(ccw.balance).toFixed(8).padStart(18)} → ${NEW_CRYPTO.toFixed(8)}  (+${NET_QTY.toFixed(8)})        ║`);
      console.log('╚═══════════════════════════════════════════════════════════════════╝');
      db.close(); process.exit(0);
    } catch (err) {
      console.error('\n  🔴 DB FAIL:', err.message);
      db.run('ROLLBACK', re => { if (re) console.error('ROLLBACK FAIL:', re.message); db.close(); process.exit(10); });
    }
  }));
})().catch(e => {
  console.error('\n💥 UNHANDLED:', e.message);
  if (e.response) console.error('   HTTP', e.response.status, JSON.stringify(e.response.data || {}).slice(0, 600));
  db.close(); process.exit(1);
});
