require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

const cfg = {
  apiKey: process.env.BINANCE_API_KEY?.trim() || '',
  apiSecret: process.env.BINANCE_API_SECRET?.trim() || '',
  baseUrl: process.env.BINANCE_BASE_URL?.trim() || 'https://api.binance.com',
  mode: (process.env.BINANCE_MODE || 'live').toLowerCase(),
};

const H = { 'X-MBX-APIKEY': cfg.apiKey };
const isPlaceHolder = v => !v || /your_|REPLACE|example/i.test(v);

if (isPlaceHolder(cfg.apiKey) || isPlaceHolder(cfg.apiSecret)) {
  console.log('❌ Keys are still placeholders — check .env.');
  process.exit(1);
}

function signQuery(params) {
  const qs = new URLSearchParams(params).toString();
  const sig = crypto.createHmac('sha256', cfg.apiSecret).update(qs).digest('hex');
  return `${qs}&signature=${sig}`;
}
const GET = async (p, params = {}) => {
  const t = Date.now();
  const s = signQuery({ ...params, timestamp: t });
  const url = `${cfg.baseUrl}${p}?${s}`;
  return (await axios.get(url, { headers: H, timeout: 15000 })).data;
};
const POST = async (p, params = {}) => {
  const t = Date.now();
  const s = signQuery({ ...params, timestamp: t });
  const url = `${cfg.baseUrl}${p}?${s}`;
  return (await axios.post(url, undefined, { headers: H, timeout: 15000 })).data;
};

(async () => {
  console.log('═══ BINANCE LIVE KEY VALIDATION + BALANCE ═══');
  console.log(`API URL  : ${cfg.baseUrl}`);
  console.log(`API Key  : ${cfg.apiKey.slice(0,8)}… (len=${cfg.apiKey.length})`);
  console.log(`Secret   : ${cfg.apiSecret.slice(0,8)}… (len=${cfg.apiSecret.length})`);
  console.log(`Mode     : ${cfg.mode}\n`);

  // 1. Account info — proves the key works, perms, and shows balances
  let account = null;
  try {
    account = await GET('/api/v3/account');
    console.log(`✅ /api/v3/account OK — canTrade=${account.canTrade} canWithdraw=${account.canWithdraw} canDeposit=${account.canDeposit}`);
    console.log(`   MakerCommission=${account.makerCommission}bps  TakerCommission=${account.takerCommission}bps`);
    console.log(`   AccountType=${account.accountType}  Status=${account.accountStatus}`);
  } catch (e) {
    console.log('❌ /api/v3/account FAIL:', e.response?.status, e.response?.data?.msg || e.message);
    const code = e.response?.data?.code;
    if (code === -2014) console.log('   → API key format invalid or API Secret wrong (signature mismatch: code -2014)');
    if (code === -2015) console.log('   → API Key expired, revoked, or IP not whitelisted (code -2015 Invalid API-key / MSB)');
    if (code === -1021) console.log('   → System clock behind/ahead (timestamp outside recvWindow). Check NTP.');
    process.exit(1);
  }

  // 2. Balances (only non-zero)
  const bals = (account.balances || []).map(b => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked) }))
    .filter(b => b.free + b.locked > 0);
  console.log(`\n💰 SPOT BALANCES (non-zero only — ${bals.length} assets with balance):`);
  if (bals.length === 0) console.log('   (EMPTY — no funds on this Binance Spot wallet at all)');
  let usdtFree = 0;
  bals.forEach(b => {
    const tot = b.free + b.locked;
    console.log(`   • ${b.asset.padEnd(8)}  free=${b.free.toFixed(6).padStart(18)}  locked=${b.locked.toFixed(6).padStart(18)}  total=${tot.toFixed(6)}`);
    if (b.asset === 'USDT') usdtFree = b.free;
  });

  // 3. Price ticker for coins we care about
  console.log('\n📈 LAST PRICE TICKER:');
  for (const sym of ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT']) {
    try {
      const t = (await axios.get(`${cfg.baseUrl}/api/v3/ticker/price?symbol=${sym}`, { timeout: 5000 })).data;
      console.log(`   • ${sym.padEnd(10)} = $${Number(t.price).toLocaleString(undefined,{maximumFractionDigits:2})}`);
    } catch {}
  }

  // 4. Crypto BUY capacity check (critical question)
  console.log('\n──────────────────────────────────────────────────────────');
  console.log('  CAN WE BUY BTC / USDT LIVE FROM BINANCE RIGHT NOW?');
  console.log('──────────────────────────────────────────────────────────');
  const merchantUSD = 3649;
  const btcPrice = Number((await axios.get(`${cfg.baseUrl}/api/v3/ticker/price?symbol=BTCUSDT`, { timeout: 5000 })).data.price || 0);
  const maxBuyByWallet   = merchantUSD;
  const maxBuyByBinance  = usdtFree;
  const maxLivePossible  = Math.min(maxBuyByWallet, maxBuyByBinance);

  console.log(`\n   Merchant DB USD wallet      : $${merchantUSD.toFixed(2)}`);
  console.log(`   Binance Spot USDT (free)    : $${usdtFree.toFixed(2)}`);
  console.log(`   BTC Market Price            : $${btcPrice.toLocaleString(undefined,{maximumFractionDigits:2})}/BTC`);
  console.log('');
  console.log(`   MAX we can commit via SERVICE = MIN(local wallet, Binance USDT free):`);
  console.log(`     → $${maxLivePossible.toFixed(2)} USD worth.`);
  if (btcPrice > 0 && maxLivePossible > 0) {
    console.log(`     → At current BTC rate  ≈  ${(maxLivePossible / btcPrice).toFixed(8)} BTC`);
  }

  if (usdtFree >= merchantUSD) {
    console.log(`\n   ✅ BINANCE SPOT USDT IS SUFFICIENT FOR FULL $${merchantUSD} BTC BUY`);
    console.log(`      Live service call will actually execute MARKET BUY on Binance,`);
    console.log(`      provider_mode = "binance_live", real BTC credited, real USDT deducted from Binance.`);
  } else if (usdtFree > 0) {
    const short = merchantUSD - usdtFree;
    console.log(`\n   ⚠️  BINANCE USDT PARTIALLY SUFFICIENT — can live-execute buys`);
    console.log(`      up to $${usdtFree.toFixed(2)} only. For full $${merchantUSD} buy, top up Binance Spot with USDT.`);
    console.log(`      Shortfall to enable full buy: $${short.toFixed(2)} USDT (≈ ${(short/btcPrice).toFixed(8)} BTC worth).`);
    console.log(`      Service will graceful-fallback to "internal" quantity credit for any portion Binance rejects.`);
  } else {
    console.log(`\n   ❌ BINANCE SPOT USDT BALANCE IS ZERO.`);
    console.log(`      All BTC/ETH market buys will gracefully FALLBACK to "internal"`);
    console.log(`      ledger credits (no real Binance order executed).`);
    console.log(`      To enable LIVE coin movement: deposit USDT to Binance Spot wallet`);
    console.log(`      → https://www.binance.com/en/my/wallet/account/main/deposit/crypto/USDT`);
    console.log(`      Network: TRC-20 (cheapest) or ERC-20 (higher confirmations).`);
  }

  // 5. Quick API permissions summary (for withdrawal etc)
  console.log('\n──────────────────────────────────────────────────────────');
  console.log('  API KEY PERMISSIONS SUMMARY:');
  console.log(`   ✅ Spot Reading       : ${account.canTrade ? 'YES' : 'NO (restricted)'}  (GET /api/v3/account works)`);
  console.log(`   ✅ Spot Trading BUY   : ${account.canTrade ? 'YES (MARKET orders enabled)' : 'NO — key locked (read-only)'} `);
  console.log(`   ✅ Spot Trading SELL  : ${account.canTrade ? 'YES' : 'NO'} `);
  console.log(`   ✅ Withdrawals allowed: ${account.canWithdraw ? 'YES (requires additional security config on Binance API page)' : 'NO — key created without Withdrawal flag'}`);
  console.log(`   💡 For on-chain USDT TRC-20 withdrawal via withdrawAsset():  enable Withdrawal on API key + whitelist IP + add withdrawal addresses in Binance security.`);

  process.exit(0);
})().catch(e => {
  console.error('\n💥 UNHANDLED:', e.message);
  if (e.response) console.error('   HTTP', e.response.status, JSON.stringify(e.response.data).slice(0,400));
  process.exit(1);
});
