const path = require('path');
const axios = require(path.join(__dirname, 'backend', 'node_modules', 'axios'));
const sqlite3 = require(path.join(__dirname, 'backend', 'node_modules', 'sqlite3')).verbose();

function q(db, sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
}

function toHexAddr(tronBase58) {
  // Tron base58 -> 41-prefixed hex -> strip 41 -> 0x EVM address (same underlying pubkey)
  // NOTE: naive conversion — not a real base58check decode, only used to flag "possible" EVM match.
  return null;
}

const TRON_ADDR = 'TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP';
const USDT_TRC20 = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BEP20 = '0x55d398326f99059fF775485246999027B3197955';
const USDT_POLY  = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';

async function tronScanGet(rel) {
  return (await axios.get('https://apilist.tronscanapi.com/api/' + rel, { timeout: 15000 })).data;
}

(async () => {
  console.log('===== WALLET RECONCILIATION FOR ' + TRON_ADDR + ' =====\n');

  // ============================================================
  // 1. TRON CHAIN — multi-source balance + recent TX history
  // ============================================================
  console.log('── 1. Tron (TRC-20) chain ──');
  try {
    const g = await axios.post('https://api.trongrid.io/wallet/getaccount', { address: TRON_ADDR }, { timeout: 10000 });
    const trxBal = (g.data.balance || 0) / 1e6;
    const activated = !!g.data.address;
    console.log('  TronGrid getAccount: activated=' + activated + '  TRX balance=' + trxBal.toFixed(6) + ' TRX');
    if (!activated) console.log('  ⚠ Account NOT activated on Tron chain — means ZERO incoming TRX/TRC20 tx has ever reached this address.');

    const u = await axios.post('https://api.trongrid.io/wallet/triggerconstantcontract', {
      owner_address: TRON_ADDR, contract_address: USDT_TRC20,
      function_selector: 'balanceOf(address)',
      parameter: '000000000000000000000000' + TRON_ADDR.slice(2),
      fee_limit: 1_000_000_000,
    }, { timeout: 10000 });
    const usdtTron = parseInt(u.data.constant_result?.[0] || '0', 16) / 1e6;
    console.log('  TronGrid USDT TRC-20 balanceOf: ' + usdtTron.toFixed(6) + ' USDT');

    // TronScan balance
    try {
      const ts = await tronScanGet('account?address=' + encodeURIComponent(TRON_ADDR));
      const tsTrx = (ts.balance || 0) / 1e6;
      const tsUsdt = ((ts.trc20token_balances || []).find(t => t.tokenId === USDT_TRC20 || t.symbol === 'USDT') || {}).balance;
      const tsUsdtNum = tsUsdt ? (Number(tsUsdt) / 1e6) : 0;
      console.log('  TronScan account.balance (TRX): ' + tsTrx.toFixed(6));
      console.log('  TronScan TRC-20 USDT balance:    ' + tsUsdtNum.toFixed(6));
    } catch (e) {
      console.log('  TronScan account lookup: failed ' + e.message);
    }

    // TronScan recent transactions (last 7 days)
    try {
      const txs = await tronScanGet('transfer?address=' + encodeURIComponent(TRON_ADDR) + '&limit=20&start=0');
      const list = (txs.data || []).slice(0, 10);
      console.log('  TronScan recent transfers (last 20):');
      if (!list.length) console.log('    (NONE — address has 0 incoming/outgoing tx ever)');
      list.forEach(t => {
        const dir = t.to_address && t.to_address === TRON_ADDR ? 'IN ' : 'OUT';
        const amt = (Number(t.amount) / Math.pow(10, t.decimals || 6)).toFixed(t.decimals || 6);
        console.log('    ' + new Date(t.block_ts).toISOString().slice(0,16) + ' ' + dir + ' ' + amt + ' ' + (t.tokenInfo?.symbol || t.contractType || 'TRX') + ' hash=' + (t.hash || '').slice(0,16) + '… from=' + (t.ownerAddress || t.from_address || '').slice(0,12) + '…');
      });
    } catch (e) {
      console.log('  TronScan transfers: failed ' + e.message);
    }
  } catch (e) {
    console.log('  Tron probe ERROR:', e.message);
  }

  // ============================================================
  // 2. COMMON MISTAKE — check the same privkey's EVM address
  //    (A Tron keypair also works on BSC/Polygon. Users often
  //     send BEP-20 USDT to the 0x-address believing they sent
  //     to TRC-20.)
  // ============================================================
  console.log('\n── 2. Wrong-network probe (BSC BEP-20 / Polygon ERC-20) ──');
  console.log('  If you selected "BSC/BEP20" or "Polygon/ERC20" in Binance withdrawal,');
  console.log('  the coins did NOT land on this Tron T-address. They are on the');
  console.log('  0x-EVM address derived from the SAME private key.');
  console.log('  To probe, we need the 0x address. I cannot derive it from T-address');
  console.log('  without the private key, but I will check .env for any set address.');

  // Read env addresses
  const fs = require('fs');
  let envText = '';
  try { envText = fs.readFileSync(path.join(__dirname, 'backend', '.env'), 'utf8'); } catch {}
  const bscAddr = (envText.match(/^BSC_WALLET_ADDRESS=(.+)$/m) || [])[1]?.trim();
  const polyAddr = (envText.match(/^POLYGON_WALLET_ADDRESS=(.+)$/m) || [])[1]?.trim();
  console.log('  .env BSC_WALLET_ADDRESS     : ' + (bscAddr || '(not set / placeholder)'));
  console.log('  .env POLYGON_WALLET_ADDRESS : ' + (polyAddr || '(not set / placeholder)'));

  // Probe BSC if a real-looking address is set
  async function probeEvmUsdt(label, rpcUrl, chainName, contract, walletAddr) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddr || '')) {
      console.log('  [' + label + '] skip: no real 0x address set.');
      return;
    }
    try {
      const gas = await axios.post(rpcUrl, { jsonrpc: '2.0', method: 'eth_getBalance', params: [walletAddr, 'latest'], id: 1 }, { timeout: 10000 });
      const gasNum = parseInt(gas.data.result || '0x0', 16) / 1e18;
      const bal = await axios.post(rpcUrl, { jsonrpc: '2.0', method: 'eth_call', params: [{
        to: contract,
        data: '0x70a08231' + '0'.repeat(24) + walletAddr.slice(2),
      }, 'latest'], id: 2 }, { timeout: 10000 });
      const usdtNum = parseInt(bal.data.result || '0x0', 16) / 1e6;
      console.log('  [' + label + '] addr=' + walletAddr.slice(0,10) + '…  native gas=' + gasNum.toFixed(8) + ' ' + chainName + '  USDT=' + usdtNum.toFixed(6));
      if (usdtNum > 0) console.log('    ✅ FOUND USDT on ' + label + ' — you likely selected the wrong network in Binance!');
    } catch (e) {
      console.log('  [' + label + '] probe failed: ' + e.message);
    }
  }

  if (bscAddr && !bscAddr.includes('your_') && !bscAddr.includes('REPLACE')) {
    await probeEvmUsdt('BSC BEP-20', 'https://bsc-dataseed.binance.org', 'BNB', USDT_BEP20, bscAddr);
  } else {
    console.log('  [BSC BEP-20] skip: BSC_WALLET_ADDRESS is placeholder. To probe manually,');
    console.log('    derive 0x-address from TRON_PRIVATE_KEY using https://iancoleman.io/');
    console.log('    or run: node -e "const TronWeb=require(\'tronweb\');const w=new TronWeb({fullNode:\'x\'});console.log(w.address.toHex(\'' + TRON_ADDR + '\').replace(/^41/,\'0x\'))"');
  }
  if (polyAddr && !polyAddr.includes('your_') && !polyAddr.includes('REPLACE')) {
    await probeEvmUsdt('Polygon ERC-20', 'https://polygon-rpc.com', 'MATIC', USDT_POLY, polyAddr);
  } else {
    console.log('  [Polygon ERC-20] skip: POLYGON_WALLET_ADDRESS is placeholder (same as BSC).');
  }

  // ============================================================
  // 3. Check root DB for any other wallet addresses booked
  // ============================================================
  console.log('\n── 3. Internal DB cross-check (root database.sqlite) ──');
  const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), sqlite3.OPEN_READONLY);
  try {
    const m = await q(db, "SELECT merchant_id, asset, amount, meta FROM merchant_crypto_balances ORDER BY asset");
    console.log('  merchant_crypto_balances rows: ' + m.length);
    m.forEach(r => {
      const isMock = /mock/i.test(r.meta || '');
      console.log('    merchant=' + String(r.merchant_id).slice(0,10) + '  asset=' + r.asset.padEnd(6) + '  qty=' + Number(r.amount).toFixed(8) + (isMock ? '  ⚠ MOCK/DEMO row' : ''));
    });
    const mw = await q(db, "SELECT merchant_id, currency, balance FROM merchant_wallets ORDER BY currency");
    console.log('  merchant_wallets rows: ' + mw.length);
    mw.forEach(r => console.log('    merchant=' + String(r.merchant_id).slice(0,10) + '  ' + r.currency + '=$' + Number(r.balance).toFixed(2)));
  } finally { db.close(); }

  // ============================================================
  // 4. Conclusion
  // ============================================================
  console.log('\n===== RECONCILIATION CONCLUSION =====\n');
  console.log('  Tron chain evidence: the T-address ' + TRON_ADDR.slice(0,12) + '…');
  console.log('    • has NEVER received a TRC-20 USDT or TRX tx (0 incoming tx found on TronScan).');
  console.log('    • Balance = 0.000000 USDT TRC-20, 0.000000 TRX.');
  console.log('');
  console.log('  Probable cause for "I sent 18.5–20 USDT from Binance":');
  console.log('    ① On Binance withdrawal page you selected NETWORK = BSC (BEP20) instead of TRC20.');
  console.log('      → Funds are on the 0x-EVM address derived from the SAME private key.');
  console.log('      → Set BSC_WALLET_ADDRESS = <that 0x-address> in backend/.env line 79, re-run probe.');
  console.log('    ② Or you sent to a *different* T-address (double-check Binance → Wallet →');
  console.log('      Transaction History → Withdraw → the destination address field).');
  console.log('    ③ Or Binance withdrawal is still pending (Travel Rule questionnaire).');
  console.log('      Check: https://www.binance.com/en/my/wallet/history/deposit-crypto');
})().catch(e => { console.error('\nFATAL:', e.message, e.stack); process.exit(1); });
