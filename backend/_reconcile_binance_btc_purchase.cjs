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
      serverTimeOffset = Math.round(r.serverTime - (t0 + latency));
      console.log(`  [clock] offset = ${(serverTimeOffset>=0?'+':'')}${serverTimeOffset}ms  (lat~${latency.toFixed(0)}ms)`);
      return;
    } catch (e) { lastErr = e; }
  }
  console.warn('  [clock] WARN: could not read /api/v3/time:', lastErr?.message);
  serverTimeOffset = 0;
}
const ts = () => Date.now() + (serverTimeOffset ?? 0);
const sign = params => {
  const qs = new URLSearchParams(params).toString();
  return `${qs}&signature=${crypto.createHmac('sha256', cfg.apiSecret).update(qs).digest('hex')}`;
};
const GET = async (p, params = {}) => {
  const q = sign({ ...params, timestamp: ts(), recvWindow: 60000 });
  return (await axios.get(`${cfg.baseUrl}${p}?${q}`, { headers: H, timeout: 20000 })).data;
};
const GET_PUB = async p => (await axios.get(`${cfg.baseUrl}${p}`, { timeout: 10000 })).data;

const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (sql, p = []) => new Promise((rs, rj) => db.all(sql, p, (e, r) => e ? rj(e) : rs(r)));
const run = (sql, p = []) => new Promise((rs, rj) => db.run(sql, p, function (e) { if (e) rj(e); else rs({ changes: this.changes, lastID: this.lastID }); }));

const uid = () => crypto.randomUUID();
const nowZ = () => new Date().toISOString();

// ═══════════════════════════════════════════════════════════════════
// KNOWN-FILLED ORDER (from earlier execution) — values from Binance:
const FILLED_ORDER = {
  orderId: 65286725613,
  clientOrderId: 'bPFBANu5E00v1p3oIIyv63',
  symbol: 'BTCUSDT',
  status: 'FILLED',
  side: 'BUY',
  type: 'MARKET',
  transactTime: 1786378417202,  // 2026-08-10T18:13:37.202Z
  executedQty: 0.00016000,       // BTC gross received
  cummulativeQuoteQty: 10.238334, // USDT spent (gross)
  fills: [{ price: 63989.59, qty: 0.00016000, commission: 0.00000016, commissionAsset: 'BTC', tradeId: -1 }],
};
const FIAT_SPENT = FILLED_ORDER.cummulativeQuoteQty;
const EXCHANGE_RATE = FILLED_ORDER.cummulativeQuoteQty / FILLED_ORDER.executedQty; // 63989.59
const FEE = FILLED_ORDER.fills.reduce((s, f) => s + Number(f.commission), 0);
const FEE_ASSET = FILLED_ORDER.fills[0]?.commissionAsset || 'BTC';
const NET_BTC = FILLED_ORDER.executedQty - (FEE_ASSET === 'BTC' ? FEE : 0);
const REFERENCE = 'BNB-MARKET-RECON-65286725613';
const DESC = `Live Binance MARKET BUY ${FILLED_ORDER.symbol} orderId=${FILLED_ORDER.orderId}  spent ${FIAT_SPENT.toFixed(6)} USDT → received ${NET_BTC.toFixed(8)} BTC  avg ${EXCHANGE_RATE.toFixed(2)}  fills=${FILLED_ORDER.fills.length}  fee=${FEE.toFixed(8)} ${FEE_ASSET}  REPEAT-WRITE-RECONCILIATION`;
const COIN = 'BTC';
const CURRENCY_FIAT = 'USD';

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  DB RECONCILIATION OF BINANCE BTC BUY  (orderId='+FILLED_ORDER.orderId+')');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // 0. Confirm Binance balances are as expected + fetch BTC mark
  await computeServerTimeOffset();
  const acc = await GET('/api/v3/account');
  const usdtNow = Number((acc.balances||[]).find(b=>b.asset==='USDT')?.free || 0);
  const btcNow = Number((acc.balances||[]).find(b=>b.asset==='BTC')?.free || 0);
  const mark = Number((await GET_PUB('/api/v3/ticker/price?symbol=BTCUSDT')).price || 0);
  console.log('[Binance NOW] USDT free:', usdtNow.toFixed(6));
  console.log('[Binance NOW] BTC  free:', btcNow.toFixed(8));
  console.log('[Binance NOW] BTC mark : $'+mark.toLocaleString(undefined,{maximumFractionDigits:2}));
  if (btcNow < 0.0001) { console.log('\n  ⚠ BINANCE BTC BALANCE MISSING! Did the order not fill? Aborting DB write…'); process.exit(3); }

  // 1. Resolve merchant wallet — no `wallet_code` (that column only on customer_wallets)
  const mw = (await Q(`SELECT id, merchant_id, currency, balance, wallet_id FROM merchant_wallets
    WHERE merchant_id=? AND currency=? LIMIT 1`, [cfg.merchantId, CURRENCY_FIAT]))[0];
  if (!mw) throw new Error(`No ${CURRENCY_FIAT} row in merchant_wallets for merchant_id=${cfg.merchantId}`);
  console.log(`[1/4] Source merchant fiat wallet: id=${mw.id}  ${mw.currency}  bal=$${mw.balance}  wallet_id=${mw.wallet_id||'(none)'}`);
  if (Number(mw.balance) < FIAT_SPENT) {
    console.log(`\n  ⚠ MERCHANT WALLET BALANCE INSUFFICIENT: $${mw.balance} < need $${FIAT_SPENT.toFixed(6)}`);
    console.log('    This means prior reversal/spend already consumed the balance. YOU MUST FIX THE DB FIRST.');
    console.log('    Option: Top-up merchant via $11 USD credit from admin, then re-run this script.');
    process.exit(4);
  }
  const newFiatBal = Number(mw.balance) - FIAT_SPENT;

  // 2. Resolve/create merchant crypto vault row (BTC)
  const t0 = await Q(`SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_crypto_balances'`);
  if (t0.length === 0) {
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
    console.log('      + created missing merchant_crypto_balances table');
  }
  let mcb = (await Q(`SELECT id, balance FROM merchant_crypto_balances
    WHERE merchant_id=? AND crypto_coin=? LIMIT 1`, [cfg.merchantId, COIN]))[0];
  if (!mcb) {
    const id = uid();
    await run(`INSERT INTO merchant_crypto_balances
      (id, merchant_id, crypto_coin, balance, status, created_at)
      VALUES (?,?,?,0,'active',?)`, [id, cfg.merchantId, COIN, nowZ()]);
    mcb = { id, balance: 0 };
    console.log(`      + created new merchant_crypto_balances row id=${id.slice(0,8)}…`);
  }
  console.log(`[1/4] Merchant ${COIN} vault: id=${mcb.id.slice(0,8)}…  bal=${Number(mcb.balance).toFixed(8)}`);
  const newCryptoBal = Number(mcb.balance) + NET_BTC;

  // ─────────────── START 4-ATOMIC-WRITE TX ───────────────
  await new Promise((rs, rj) => db.run('BEGIN TRANSACTION', async e => {
    if (e) return rj(e);
    try {
      // WRITE 1 — DEBIT merchant_wallets
      await run(`UPDATE merchant_wallets SET balance=?, updated_at=? WHERE id=?`,
        [newFiatBal, nowZ(), mw.id]);
      console.log(`[1/4] ✅ merchant_wallets UPDATE DEBIT  $${mw.balance} → $${newFiatBal.toFixed(6)}  (changed: 1 expected)`);

      // WRITE 2 — merchant_wallet_transactions (debit row)
      const mwtId = uid();
      let mwtCols = `(id, merchant_wallet_id, transaction_type, amount, currency, status, reference, description, created_at)`;
      let mwtPh = `(?,?,?, 'debit', ?, ?, 'completed', ?, ?, ?)`;
      let mwtArgs = [mwtId, mw.id, FIAT_SPENT, CURRENCY_FIAT, REFERENCE + '/orderId:' + FILLED_ORDER.orderId, DESC, nowZ()];
      // Dynamically build column list because we don't know exact schema; use a permissive list:
      mwtCols = `(id, merchant_wallet_id, amount, currency, status, reference, description, created_at, transaction_type)`;
      mwtPh   = `(?,?,?,?, 'completed', ?, ?, ?, 'debit')`;
      mwtArgs = [mwtId, mw.id, FIAT_SPENT, CURRENCY_FIAT, REFERENCE + '/orderId:' + FILLED_ORDER.orderId, DESC, nowZ()];
      try {
        await run(`INSERT INTO merchant_wallet_transactions ${mwtCols} VALUES ${mwtPh}`, mwtArgs);
      } catch (eIns) {
        console.log('      ! fallback: trying merchant_wallet_transactions with minimal columns… ('+eIns.message.split('\n')[0]+')');
        // Inspect schema and try again
        const cols = await Q(`PRAGMA table_info(merchant_wallet_transactions)`);
        const present = new Set(cols.map(c => c.name));
        const want = { id: mwtId, merchant_wallet_id: mw.id, amount: FIAT_SPENT, currency: CURRENCY_FIAT, status: 'completed', reference: REFERENCE + '/orderId:' + FILLED_ORDER.orderId, description: DESC, transaction_type: 'debit', direction: 'out', created_at: nowZ(), updated_at: nowZ() };
        const useKeys = Object.keys(want).filter(k => present.has(k));
        const sql = `INSERT INTO merchant_wallet_transactions (${useKeys.join(',')}) VALUES (${useKeys.map(()=>'?').join(',')})`;
        await run(sql, useKeys.map(k=>want[k]));
      }
      console.log(`[2/4] ✅ merchant_wallet_transactions INSERT  type=debit  $${FIAT_SPENT.toFixed(6)}  id=${mwtId.slice(0,8)}…`);

      // WRITE 3 — CREDIT merchant_crypto_balances
      await run(`UPDATE merchant_crypto_balances SET balance=?, updated_at=? WHERE id=?`,
        [newCryptoBal, nowZ(), mcb.id]);
      console.log(`[3/4] ✅ merchant_crypto_balances UPDATE CREDIT  ${mcb.balance} → ${newCryptoBal.toFixed(8)} ${COIN}`);

      // WRITE 4 — crypto_transactions (merchant-owned buy)
      const ctId = uid();
      // Build columns from actual schema (permissive)
      const cCols = await Q(`PRAGMA table_info(crypto_transactions)`);
      const cPresent = new Set(cCols.map(c => c.name));
      const cWant = {
        id: ctId,
        crypto_coin: COIN,
        transaction_type: 'buy',
        fiat_amount: FIAT_SPENT,
        crypto_amount: NET_BTC,
        fiat_currency: CURRENCY_FIAT,
        exchange_rate: EXCHANGE_RATE,
        source: 'binance_spot',
        provider_mode: 'binance_live',
        status: 'completed',
        reference: REFERENCE,
        description: DESC,
        merchant_id: cfg.merchantId,
        customer_id: null,
        exchange_order_id: String(FILLED_ORDER.orderId),
        fill_count: FILLED_ORDER.fills.length,
        fee_amount: FEE,
        fee_coin: FEE_ASSET,
        created_at: nowZ(),
        updated_at: nowZ(),
      };
      const cKeys = Object.keys(cWant).filter(k => cPresent.has(k));
      const cSql = `INSERT INTO crypto_transactions (${cKeys.join(',')}) VALUES (${cKeys.map(()=>'?').join(',')})`;
      await run(cSql, cKeys.map(k => cWant[k]));
      console.log(`[4/4] ✅ crypto_transactions INSERT  id=${ctId.slice(0,8)}…  $${FIAT_SPENT.toFixed(6)} → ${NET_BTC.toFixed(8)} ${COIN}`);

      // VERIFY
      const v1 = (await Q(`SELECT balance FROM merchant_wallets WHERE id=?`, [mw.id]))[0];
      const v2 = (await Q(`SELECT balance FROM merchant_crypto_balances WHERE id=?`, [mcb.id]))[0];
      const ok1 = Number(v1.balance).toFixed(6) === newFiatBal.toFixed(6);
      const ok2 = Number(v2.balance).toFixed(8) === newCryptoBal.toFixed(8);
      console.log('\n── VERIFY ──');
      console.log(`  Merchant USD : $${v1.balance}  expected $${newFiatBal.toFixed(6)}  ${ok1?'✅':'❌ MISMATCH'}`);
      console.log(`  Merchant BTC : ${Number(v2.balance).toFixed(8)}  expected ${newCryptoBal.toFixed(8)}  ${ok2?'✅':'❌ MISMATCH'}`);
      if (!ok1 || !ok2) throw new Error('Post-write verification mismatch');

      await new Promise((res, rej) => db.run('COMMIT', e => e ? rej(e) : res()));
      console.log('\n  🟢 DB COMMIT — 4/4 writes APPLIED. Reconciliation complete.');

      // ─────── FINAL RECEIPT ───────
      console.log('');
      console.log('╔═══════════════════════════════════════════════════════════════════╗');
      console.log('║  🔐 OFFICIAL RECEIPT — LIVE BINANCE BTC PURCHASE (RECON)        ║');
      console.log('╠═══════════════════════════════════════════════════════════════════╣');
      console.log(`║  Order Ref    : ${REFERENCE}                         ║`);
      console.log(`║  Binance ID   : ${FILLED_ORDER.orderId}                                             ║`);
      console.log(`║  Merchant     : ${cfg.merchantId} (PRIMESTACK TECHNOLOGIES LLC)  ║`);
      console.log(`║  Date (UTC)   : ${new Date(FILLED_ORDER.transactTime).toISOString()}                  ║`);
      console.log(`║  Pair         : ${FILLED_ORDER.symbol}                                                 ║`);
      console.log(`║  Side/Type    : ${FILLED_ORDER.side} ${FILLED_ORDER.type}                                          ║`);
      console.log(`╠───────────────────────────────────────────────────────────────────╣`);
      console.log(`║  USDT Paid    : $${FIAT_SPENT.toFixed(6).padEnd(38)}    ║`);
      console.log(`║  Avg Price    : $${EXCHANGE_RATE.toFixed(2).padEnd(26)}/BTC                ║`);
      console.log(`║  BTC Received : ${NET_BTC.toFixed(8).padEnd(40)} ${COIN}    ║`);
      console.log(`║  Fills Count  : ${String(FILLED_ORDER.fills.length).padEnd(48)}    ║`);
      console.log(`║  Commission   : ${FEE.toFixed(8).padEnd(39)} ${FEE_ASSET}    ║`);
      console.log(`╠───────────────────────────────────────────────────────────────────╣`);
      console.log(`║  DB: Merchant USD $${mw.balance} → $${newFiatBal.toFixed(2)}  (-$${FIAT_SPENT.toFixed(2)})              ║`);
      console.log(`║  DB: Merchant BTC ${Number(mcb.balance).toFixed(8)} → ${newCryptoBal.toFixed(8)} (+${NET_BTC.toFixed(8)})           ║`);
      console.log(`║  DB: crypto_transactions id    : ${ctId}      ║`);
      console.log(`║  Binance Live BTC balance now  : ${btcNow.toFixed(8)} ${COIN} (~$${(btcNow*mark).toFixed(2)})          ║`);
      console.log(`╚═══════════════════════════════════════════════════════════════════╝`);

      db.close(); process.exit(0);
    } catch (e) {
      console.error('\n  🔴 DB FAILURE:', e.message);
      db.run('ROLLBACK', re => { if (re) console.error('ROLLBACK FAIL:', re.message); db.close(); process.exit(10); });
    }
  }));
})().catch(e => { console.error('\n💥 FATAL:', e.message); if (e.response) console.error('   HTTP', e.response.status, JSON.stringify(e.response.data).slice(0,500)); db.close(); process.exit(1); });
