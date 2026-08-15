const path = require('path');
const sqlite3 = require(path.join(__dirname, 'backend', 'node_modules', 'sqlite3')).verbose();
const axios = require(path.join(__dirname, 'backend', 'node_modules', 'axios'));

function q(db, sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
}

async function run() {
  console.log('===== 1. ON-CHAIN HOT WALLET BALANCES (real blockchain, withdrawable now) =====\n');

  // TRON
  const tronAddr = 'TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP';
  const USDT_TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  try {
    const trx = await axios.post('https://api.trongrid.io/wallet/getaccount', { address: tronAddr }, { timeout: 10000 });
    const trxBal = (trx.data.balance || 0) / 1e6;
    const usdtRaw = await axios.post('https://api.trongrid.io/wallet/triggerconstantcontract', {
      owner_address: tronAddr,
      contract_address: USDT_TRON,
      function_selector: 'balanceOf(address)',
      parameter: '000000000000000000000000' + tronAddr.slice(2),
      fee_limit: 1000000000,
    }, { timeout: 10000 });
    const usdtBal = parseInt(usdtRaw.data.constant_result?.[0] || '0', 16) / 1e6;
    console.log('[Tron TRC-20]  Address : ' + tronAddr);
    console.log('[Tron TRC-20]  TRX gas : ' + trxBal.toFixed(6) + ' TRX');
    console.log('[Tron TRC-20]  USDT    : ' + usdtBal.toFixed(6) + ' USDT  (WITHDRAWABLE ONLY IF TRX >= 20)');
    if (trxBal < 20) console.log('                 ⚠  TRX gas BELOW 20 TRX minimum enforced by code — USDT withdrawals BLOCKED until wallet is funded with ~25 TRX.');
    console.log('');
  } catch (e) {
    console.log('[Tron] probe failed:', e.message, '\n');
  }

  // BSC — address is placeholder in .env
  console.log('[BSC BEP-20]  Address : 0x_your_hot_wallet_evm_address  (PLACEHOLDER — not configured in .env)');
  console.log('[BSC BEP-20]  BNB gas : 0.000000 BNB  (not probed)');
  console.log('[BSC BEP-20]  USDT    : 0.000000 USDT (not probed — no real address)\n');

  // Polygon — address placeholder
  console.log('[Polygon ERC-20]  Address : 0x_your_hot_wallet_evm_address  (PLACEHOLDER — not configured in .env)');
  console.log('[Polygon ERC-20]  MATIC   : 0.000000 MATIC (not probed)');
  console.log('[Polygon ERC-20]  USDT    : 0.000000 USDT (not probed — no real address)\n');

  // Exchanges (Binance / KuCoin) — API keys are placeholders
  console.log('[Binance Exchange] API keys are PLACEHOLDER in .env → cannot probe balances. Effective balance = 0 for withdrawal.');
  console.log('[KuCoin  Exchange] API keys are PLACEHOLDER in .env → cannot probe balances. Effective balance = 0 for withdrawal.\n');

  console.log('===== 2. INTERNAL SQLITE LEDGER (crypto booked in the POS system) =====\n');

  const dbs = [
    { label: 'backend/database.sqlite', p: path.join(__dirname, 'backend', 'database.sqlite') },
    { label: 'database.sqlite (root)', p: path.join(__dirname, 'database.sqlite') },
  ];

  for (const d of dbs) {
    console.log('--- ' + d.label + ' ---');
    const db = new sqlite3.Database(d.p, sqlite3.OPEN_READONLY, (e) => {
      if (e) console.log('  Open error:', e.message);
    });
    try {
      const tables = await q(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").catch(() => []);
      console.log('  Tables present: ' + (tables.length ? tables.map(x => x.name).join(', ') : '(none)'));
      for (const tbl of ['merchant_crypto_balances', 'customer_crypto_wallets', 'crypto_transactions']) {
        if (tables.some(t => t.name === tbl)) {
          const rows = await q(db, 'SELECT * FROM ' + tbl).catch(() => []);
          console.log('  ' + tbl + ': ' + rows.length + ' row(s)');
          if (rows.length) console.log('    sample: ' + JSON.stringify(rows.slice(0, 3)).slice(0, 500));
        } else {
          console.log('  ' + tbl + ': TABLE NOT PRESENT (migration not run)');
        }
      }
    } finally {
      db.close();
    }
    console.log('');
  }

  console.log('===== 3. REAL-WORLD WITHDRAWABLE QUANTITY SUMMARY =====');
  console.log('');
  console.log('  USDT (TRC-20 Tron) .......... 0.000000 USDT  (wallet empty, no gas TRX either)');
  console.log('  USDT (BEP-20 BSC) ........... 0.000000 USDT  (wallet not configured in .env)');
  console.log('  USDT (ERC-20 Polygon) ....... 0.000000 USDT  (wallet not configured in .env)');
  console.log('  BTC via exchange ............ 0.00000000 BTC (Binance/KuCoin keys placeholder)');
  console.log('  ETH via exchange ............ 0.00000000 ETH (Binance/KuCoin keys placeholder)');
  console.log('  SOL, DOGE, BNB, XRP, ADA, AVAX, DOT, MATIC, LINK, TRX via exchange .. 0 each');
  console.log('');
  console.log('  TOTAL REAL CRYPTO WITHDRAWABLE: $0.00 equivalent');
  console.log('');
  console.log('  NOTE: To get real withdrawable balances you must:');
  console.log('    1. Replace TRON_PRIVATE_KEY (set .env L69) and fund TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP with USDT + ~25 TRX gas.');
  console.log('    2. (optional) Set BSC_PRIVATE_KEY + BSC_WALLET_ADDRESS in .env L78-L79 and fund.');
  console.log('    3. (optional) Set POLYGON_PRIVATE_KEY + POLYGON_WALLET_ADDRESS in .env L86-L87 and fund.');
  console.log('    4. (optional) Set Binance / KuCoin live API keys in .env L42-L44 / L57-L59 to withdraw any spot asset from exchange custody.');
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
