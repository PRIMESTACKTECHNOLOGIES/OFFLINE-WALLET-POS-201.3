const path = require('path');
const sqlite3 = require(path.join(__dirname, 'backend', 'node_modules', 'sqlite3')).verbose();
const axios = require(path.join(__dirname, 'backend', 'node_modules', 'axios'));

function q(db, sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
}

// Same fallback map the app uses, from wallets.service.ts
const FALLBACK_PRICES = { BTC: 67000, ETH: 3400, USDT: 1.00, SOL: 145, DOGE: 0.12, BNB: 580, XRP: 0.55, ADA: 0.45, AVAX: 28, DOT: 6.5, MATIC: 0.7, LINK: 14, TRX: 0.12 };
const CG_MAP = { BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether', SOL: 'solana', DOGE: 'dogecoin', BNB: 'binancecoin', XRP: 'ripple', ADA: 'cardano', AVAX: 'avalanche-2', DOT: 'polkadot', MATIC: 'matic-network', LINK: 'chainlink', TRX: 'tron' };

async function livePrice(asset) {
  const id = CG_MAP[asset];
  if (!id) return FALLBACK_PRICES[asset] ?? NaN;
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=' + id + '&vs_currencies=usd', { timeout: 5000 });
    return Number(r.data?.[id]?.usd) || FALLBACK_PRICES[asset] || NaN;
  } catch { return FALLBACK_PRICES[asset]; }
}

(async () => {
  const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), sqlite3.OPEN_READONLY);
  try {
    console.log('===== INTERNAL CRYPTO VAULT → REAL-BACKING RECONCILIATION =====\n');

    // A. Raw merchant_crypto_balances rows (what the Vault display reads from)
    const mcb = await q(db, 'SELECT id, merchant_id, asset, amount, meta FROM merchant_crypto_balances ORDER BY asset, merchant_id');
    console.log('merchant_crypto_balances rows: ' + mcb.length);
    const byAsset = new Map();
    let totalVaultUsd = 0;
    console.log('');
    console.log('ID                              merchant  asset    quantity         mock?  unit_price  subtotal_USD');
    console.log('────────────────────────────────────────────────────────────────────────────────────────────────');
    for (const r of mcb) {
      const price = await livePrice(r.asset);
      const qty = Number(r.amount);
      const usdVal = qty * price;
      const isMock = /"mock"\s*:\s*true/i.test(r.meta || '') || /MOCK/i.test(r.meta || '');
      byAsset.set(r.asset, (byAsset.get(r.asset) || 0) + qty);
      totalVaultUsd += usdVal;
      console.log(
        String(r.id).slice(0,32).padEnd(32) + '  ' +
        String(r.merchant_id).slice(0,8).padEnd(8) + '  ' +
        r.asset.padEnd(7) + '  ' +
        qty.toFixed(8).padStart(15) + '  ' +
        (isMock ? 'MOCK ' : 'REAL?') + '  ' +
        ('$' + price.toLocaleString(undefined, { maximumFractionDigits: 2 })).padStart(10) + '  ' +
        ('$' + usdVal.toLocaleString(undefined, { maximumFractionDigits: 2 })).padStart(14)
      );
    }

    console.log('');
    console.log('--- VAULT TOTALS BY ASSET (sum of merchant_crypto_balances rows) ---');
    let rowTotalByAsset = 0;
    for (const [asset, qty] of [...byAsset.entries()].sort()) {
      const price = await livePrice(asset);
      const usd = qty * price;
      rowTotalByAsset += usd;
      console.log('  ' + asset.padEnd(7) + '  qty=' + qty.toFixed(8).padStart(15) + '  @ $' + price.toLocaleString().padEnd(10) + '  = $' + usd.toLocaleString(undefined, { maximumFractionDigits: 2 }));
    }
    console.log('  TOTAL                                        ≈ $' + totalVaultUsd.toLocaleString(undefined, { maximumFractionDigits: 2 }) + '  (per-row sum)');

    // B. Fiat merchant wallet backing (source of funds used to "buy" the above)
    const mw = await q(db, 'SELECT merchant_id, currency, balance FROM merchant_wallets ORDER BY merchant_id, currency');
    let mwTotalUSD = 0;
    console.log('\n--- merchant_wallets (fiat backing source) ---');
    mw.forEach(r => {
      const bal = Number(r.balance);
      const usd = r.currency === 'AED' ? bal / 3.67 : bal;
      mwTotalUSD += usd;
      console.log('  merchant=' + String(r.merchant_id).slice(0, 10).padEnd(10) + '  ' + r.currency + '=' + bal.toFixed(2).padStart(10) + '  ≈ $' + usd.toFixed(2));
    });
    console.log('  FIAT TOTAL (USD approx) = $' + mwTotalUSD.toLocaleString(undefined, { maximumFractionDigits: 2 }));

    // C. Live on-chain real backing we already probed: Tron hot wallet
    const tronAddr = 'TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP';
    const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    let tronUSDT = 0, tronTRX = 0;
    try {
      const t = (await axios.get('https://apilist.tronscanapi.com/api/account?address=' + tronAddr, { timeout: 15000 })).data;
      tronTRX = (t.balance || 0) / 1e6;
      tronUSDT = Number(((t.trc20token_balances || []).find(x => x.tokenId === USDT) || {}).balance || 0) / 1e6;
    } catch {}
    const trxPrice = await livePrice('TRX');
    const tronBackingUSD = tronUSDT + tronTRX * trxPrice;
    console.log('\n--- REAL ON-CHAIN + EXCHANGE BACKING (externally verifiable) ---');
    console.log('  [Tron T-' + tronAddr.slice(0,10) + '…] USDT TRC-20 = ' + tronUSDT.toFixed(6).padStart(12) + '     = $' + tronUSDT.toLocaleString(undefined, { maximumFractionDigits: 2 }));
    console.log('  [Tron]                                   TRX = ' + tronTRX.toFixed(6).padStart(12) + '  @ $' + trxPrice.toFixed(2) + '  = $' + (tronTRX*trxPrice).toFixed(2));
    console.log('  [BSC    direct hot wallet]              USDT = 0.000000  (placeholder .env — not configured)');
    console.log('  [Polygon direct hot wallet]             USDT = 0.000000  (placeholder .env — not configured)');
    console.log('  [Binance / KuCoin exchange balances]          0 all assets (API keys still placeholder in .env)');
    console.log('  ──────────────────────────────────────────────────────────────────────');
    console.log('  REAL EXTERNAL BACKING TOTAL = $' + tronBackingUSD.toLocaleString(undefined, { maximumFractionDigits: 2 }));
    console.log('  VAULT   (DB booked)        TOTAL = $' + totalVaultUsd.toLocaleString(undefined, { maximumFractionDigits: 2 }));
    console.log('');
    console.log('  ⚠ UNBACKED / INTERNAL-ONLY PORTION (the gap) = $' + (totalVaultUsd - tronBackingUSD).toLocaleString(undefined, { maximumFractionDigits: 2 }));
    console.log('');
    console.log('--- HOW TO CLOSE THE GAP: CONVERSION STRATEGY PER ASSET ---');
    console.log('  There are exactly 3 valid production paths. Pick one per asset:');
    console.log('');
    console.log('  PATH 1 — Direct self-custody hot wallet (asset = USDT only, 0 KYC/Travel Rule)');
    console.log('    Tron TRC-20   →  already code-complete, just needs (a) TRX gas fund + (b) real private key in .env');
    console.log('    BSC BEP-20    →  code complete at backend/src/exchange/bscweb.service.ts — set BSC_PRIVATE_KEY + BSC_WALLET_ADDRESS (0x3d56a…) + fund USDT + 0.01 BNB');
    console.log('    Polygon ERC20 →  code complete at backend/src/exchange/polygonweb.service.ts — set POLYGON_PRIVATE_KEY + POLYGON_WALLET_ADDRESS (same 0x3d56a…) + fund USDT + 1 MATIC');
    console.log('');
    console.log('  PATH 2 — Exchange-mediated deposit (BTC/ETH/SOL/DOGE/BNB/XRP/ADA/AVAX/DOT/LINK/TRX)');
    console.log('    KuCoin (preferred — lower KYC friction)');
    console.log('      → enable KUCOIN_MODE=live, fill KUCOIN_API_KEY/SECRET/PASSPHRASE at .env L57-L59');
    console.log('      → on kucoin.com, deposit exact qty of each coin from merchant_crypto_balances into the KuCoin main/trading account linked to your API key');
    console.log('      → enable Withdrawal scope on the API key ONLY IF you want KuCoin outbound on-chain (otherwise use direct USDT rails for payout)');
    console.log('    Binance (alternative)');
    console.log('      → same: set BINANCE_MODE=live, BINANCE_API_KEY/SECRET .env L42-L44');
    console.log('      → beware: Binance India withdrawals require questionnaire HMAC + Travel Rule -4104 gate; prefer KuCoin + direct USDT rails instead');
    console.log('');
    console.log('  PATH 3 — Live API BUY using merchant wallet USD (convert fiat to crypto automatically)');
    console.log('      → for each asset row, wallets.service buyCryptoWithMerchant() with mode=binance_live');
    console.log('      → REQUIRES: (a) Binance/KuCoin keys live + USDT or fiat balance sitting IN the exchange');
    console.log('      → merchant_wallets USD total right now is only ~$' + mwTotalUSD.toFixed(2) + ' — insufficient to cover $' + totalVaultUsd.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' Vault, so you must DEPOSIT real fiat/crypto into the exchange first');
    console.log('');

    // D. Print exact "per-asset next-step" checklist
    console.log('=== EXACT PER-ASSET ACTION PLAN ===\n');
    for (const [asset, qty] of [...byAsset.entries()].sort()) {
      console.log(asset + ' — booked internal qty = ' + qty.toFixed(8));
      if (asset === 'USDT') {
        console.log('  → PATH 1 (direct self-custody):');
        console.log('    1. Send ≥ 6 TRX (ideally 25 TRX) to Tron address ' + tronAddr);
        console.log('    2. Paste real 64-hex private key for ' + tronAddr + '  into backend/.env line 69 TRON_PRIVATE_KEY=');
        console.log('    3. Optionally enable BSC/Polygon same-key rails for same 0x3d56a… address');
        console.log('    4. Deposit exact USDT shortfall (qty minus any already on each chain) into each hot wallet.');
      } else {
        console.log('  → PATH 2 (recommended: KuCoin deposit):');
        console.log('    1. Generate deposit address in KuCoin for ' + asset + ' (chain per KuCoin options).');
        console.log('    2. Send exactly ' + qty.toFixed(8) + ' ' + asset + ' FROM YOUR OWN EXTERNAL WALLET into that KuCoin deposit address.');
        console.log('    3. After 2 confirmations, balance will appear in KuCoin main account → API-tradable.');
        console.log('    4. Set backend/.env L57-L59 KUCOIN_MODE=live + keys + passphrase.');
        console.log('    5. (Optional) For direct on-chain withdrawal OUT, enable Withdraw scope; otherwise keep KuCoin key Spot-only and use USDT direct rails for merchant payout.');
      }
      console.log('');
    }

    console.log('=== BOTTOM LINE ===');
    console.log('  Tron + real private key      → unlocks only the 18.5 USDT + 14.18 TRX confirmed today on-chain.');
    console.log('  To make the ENTIRE $' + totalVaultUsd.toLocaleString(undefined,{maximumFractionDigits:2}) + ' Vault "real" and externally withdrawable,');
    console.log('  you must fund (i.e., transfer real assets into custody the POS controls):');
    console.log('    • USDT shortfall → direct hot wallets (Tron / BSC / Polygon)');
    console.log('    • BTC, ETH, SOL, DOGE, BNB, XRP, ADA, AVAX, DOT, MATIC, LINK, TRX shortfall → deposit each exact qty into live KuCoin or Binance account');
    console.log('                        whose API keys you will set in backend/.env.');
    console.log('    • Alternatively, fund the exchange with enough fiat/USDT and run buyCryptoWithMerchant() in live mode to let the system buy each row.');
    console.log('');
  } finally { db.close(); }
})().catch(e => { console.error('\nERR:', e.message, e.stack); process.exit(1); });
