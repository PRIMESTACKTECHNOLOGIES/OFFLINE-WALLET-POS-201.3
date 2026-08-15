require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const axios = require('axios');

const apiKey = process.env.BINANCE_API_KEY?.trim() || '';
const apiSecret = process.env.BINANCE_API_SECRET?.trim() || '';
const baseUrl = 'https://api.binance.com';

console.log('BINANCE_API_KEY present?', !!apiKey, '(len=' + apiKey.length + ')');
console.log('BINANCE_API_SECRET present?', !!apiSecret, '(len=' + apiSecret.length + ')');

function signQuery(params) {
  const qs = new URLSearchParams(params).toString();
  const sig = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
  return `${qs}&signature=${sig}`;
}

async function signedGet(path, params = {}) {
  const url = `${baseUrl}${path}?${signQuery({ ...params, timestamp: Date.now() })}`;
  const r = await axios.get(url, { headers: { 'X-MBX-APIKEY': apiKey }, timeout: 15000 }).catch(e => ({ err: true, status: e.response?.status, data: e.response?.data || e.message }));
  return r.err ? r : { err:false, status: r.status, data: r.data };
}
async function signedPost(path, params = {}) {
  const url = `${baseUrl}${path}?${signQuery({ ...params, timestamp: Date.now() })}`;
  const r = await axios.post(url, undefined, { headers: { 'X-MBX-APIKEY': apiKey }, timeout: 15000 }).catch(e => ({ err: true, status: e.response?.status, data: e.response?.data || e.message }));
  return r.err ? r : { err:false, status: r.status, data: r.data };
}

(async () => {
  // [1] /api/v3/time — check connection + server time drift
  console.log('\n[1] Check /api/v3/time (server time drift check, public, no auth)…');
  try {
    const t = await axios.get(`${baseUrl}/api/v3/time`, { timeout: 10000 });
    const drift = t.data.serverTime - Date.now();
    console.log('  OK. Server=' + new Date(t.data.serverTime).toISOString() + '  drift=' + drift + 'ms');
    if (Math.abs(drift) > 5000) console.log('  ⚠️ drift >5000ms will cause INVALID_TIMESTAMP on signed calls!');
  } catch (e) { console.log('  FAIL:', e.message.slice(0, 200)); }

  // [2] /api/v3/account — verify keys, see balances
  console.log('\n[2] SIGNED /api/v3/account (verify API key permissions)…');
  const acc = await signedGet('/api/v3/account');
  if (acc.err) { console.log('  KEY ERROR HTTP', acc.status, '→', JSON.stringify(acc.data).slice(0, 600)); }
  else {
    console.log('  KEY VALID! ✅');
    console.log('  maker/taker fees?', acc.data.makerCommission, acc.data.takerCommission);
    const bal = (acc.data.balances || []).filter(b => Number(b.free || 0) + Number(b.locked || 0) > 0);
    console.log('  Non-zero balances in Binance spot account:', bal.length);
    bal.slice(0, 10).forEach(b => console.log('    -', b.asset, 'free=' + b.free, 'locked=' + b.locked));
    if (bal.length === 0) console.log('    ⚠️ NO BALANCES! You need USD/USDT in Binance spot account to make buys with quoteOrderQty in USDT.');
  }

  // [3] Try exchanging info for symbol pairs: BTCUSDT, USDTUSD, USDCUSDT
  console.log('\n[3] Check 3 pair symbols exist via /api/v3/exchangeInfo (public, no auth)…');
  const symbols = ['BTCUSDT', 'USDTUSD', 'USDCUSDT', 'ETHUSDT'];
  try {
    const info = await axios.get(`${baseUrl}/api/v3/exchangeInfo?symbols=` + encodeURIComponent(JSON.stringify(symbols)), { timeout: 10000 });
    for (const s of (info.data.symbols || [])) {
      console.log('  ✅ SYMBOL=' + s.symbol + ' status=' + s.status + ' base=' + s.baseAsset + ' quote=' + s.quoteAsset + '  orderTypes(MARKET present=' + s.orderTypes.includes('MARKET') + ')');
    }
  } catch (e) {
    console.log('  /exchangeInfo failed: HTTP', e.response?.status, JSON.stringify(e.response?.data || e.message).slice(0, 400));
  }

  // [4] Attempt dry-run NEW_ORDER test orders (TEST endpoint, not real) for multiple pairs with quoteOrderQty=5000
  console.log('\n[4] /api/v3/order/test — TEST new orders (MARKET BUY, quoteOrderQty=5000, no funds moved):');
  const tests = [
    ['BTCUSDT', 5000],
    ['USDTUSD', 5000],
    ['USDCUSDT', 5000],
  ];
  for (const [sym, amt] of tests) {
    const t = await signedPost('/api/v3/order/test', { symbol: sym, side: 'BUY', type: 'MARKET', quoteOrderQty: String(amt) });
    console.log('  ', sym.padEnd(10), t.err ? ('❌ HTTP' + t.status + ' ' + JSON.stringify(t.data).slice(0, 160)) : '✅ ACCEPTED');
  }

  // [5] The pair that works for quoteOrderQty=5000 → execute REAL market buy that pair
  console.log('\n[5] (Optional) Best pair selected based on test order above… ready for buy.');
})();
