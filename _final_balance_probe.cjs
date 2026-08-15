const path = require('path');
const axios = require(path.join(__dirname, 'backend', 'node_modules', 'axios'));
const crypto = require('crypto');
const bs58 = (() => {
  // tiny base58 decode implementation (bitcoin/tron alphabet)
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function decode(str) {
    let num = BigInt(0);
    for (const ch of str) {
      num = num * 58n + BigInt(ALPHABET.indexOf(ch));
    }
    let hex = num.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    return Buffer.from(hex, 'hex');
  }
  return { decode };
})();

const TRON_ADDR = 'TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP';
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

function tronAddrToBytes58check(base58) {
  const full = bs58.decode(base58);
  // last 4 bytes = checksum (sha256(sha256(payload))[0:4])
  const payload = full.slice(0, -4);
  const checksum = full.slice(-4);
  const actual = crypto.createHash('sha256').update(crypto.createHash('sha256').update(payload).digest()).digest().slice(0, 4);
  if (Buffer.compare(checksum, actual) !== 0) throw new Error('base58 checksum mismatch');
  return payload; // 21 bytes: 0x41 + 20-byte pubkey-hash
}

function leftPad32(buf) {
  if (buf.length >= 32) return buf.slice(buf.length - 32);
  const out = Buffer.alloc(32, 0);
  buf.copy(out, 32 - buf.length);
  return out;
}

(async () => {
  console.log('===== TRON BALANCE (raw TronGrid, CORRECT ABI encoding) =====\n');
  console.log('Address      : ' + TRON_ADDR);

  const bytes = tronAddrToBytes58check(TRON_ADDR);
  const hex41 = bytes.toString('hex');               // '41' + 20-byte-hash  (tron format)
  const hexEvm = hex41.slice(2);                    // plain 20-byte hash    (solidity ABI address param)
  const pad32 = leftPad32(Buffer.from(hexEvm, 'hex')).toString('hex'); // parameter for balanceOf(address)
  console.log('Address hex  : 0x' + hex41);
  console.log('EVM address  : 0x' + hexEvm + '   (← same private key on BSC/Polygon controls this 0x)');
  console.log('ABI param    : ' + pad32);
  console.log('');

  const data = {
    owner_address: TRON_ADDR,
    contract_address: USDT,
    function_selector: 'balanceOf(address)',
    parameter: pad32,
    fee_limit: 1_000_000_000,
  };

  // ===== Full Node (unconfirmed) =====
  const f = await axios.post('https://api.trongrid.io/wallet/triggerconstantcontract', data, { timeout: 10000 });
  const usdtFull = parseInt(f.data.constant_result?.[0] || '0', 16) / 1e6;
  const trxResp = await axios.post('https://api.trongrid.io/wallet/getaccount', { address: TRON_ADDR }, { timeout: 10000 });
  const trxFull = (trxResp.data.balance || 0) / 1e6;
  console.log('[FullNode]   TRX = ' + trxFull.toFixed(6) + '   USDT = ' + usdtFull.toFixed(6));

  // ===== Solidity Node (confirmed-only) — what tronweb.service.ts's solidityNode endpoint reads =====
  try {
    const s = await axios.post('https://api.trongrid.io/walletsolidity/triggerconstantcontract', data, { timeout: 10000 });
    const usdtSol = parseInt(s.data.constant_result?.[0] || '0', 16) / 1e6;
    const trxS = await axios.post('https://api.trongrid.io/walletsolidity/getaccount', { address: TRON_ADDR }, { timeout: 10000 });
    const trxSol = (trxS.data.balance || 0) / 1e6;
    console.log('[Solidity]   TRX = ' + trxSol.toFixed(6) + '   USDT = ' + usdtSol.toFixed(6) + '   ← CONFIRMED balances');
  } catch (e) { console.log('[Solidity]   probe failed: ' + e.message); }

  // ===== TronScan indexed (for reference) =====
  try {
    const t = (await axios.get('https://apilist.tronscanapi.com/api/account?address=' + encodeURIComponent(TRON_ADDR), { timeout: 15000 })).data;
    const tsTrx = (t.balance || 0) / 1e6;
    const tsUsdt = Number(((t.trc20token_balances || []).find(x => x.tokenId === USDT) || {}).balance || 0) / 1e6;
    console.log('[TronScan]   TRX = ' + tsTrx.toFixed(6) + '   USDT = ' + tsUsdt.toFixed(6));
  } catch (e) { console.log('[TronScan]   probe failed: ' + e.message); }

  // ===== BSC / POLYGON SAME-KEY EVM address probe =====
  console.log('');
  console.log('===== SAME PRIVATE KEY → EVM ADDRESS PROBE (0x' + hexEvm.slice(0, 10) + '…) =====');
  console.log('  If Binance withdrawal was sent as BEP20/ERC20 instead of TRC20, funds are here:');
  const evm0x = '0x' + hexEvm;
  const USDT_BEP20 = '0x55d398326f99059fF775485246999027B3197955';
  const USDT_POLY  = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
  const pad32Evm = '000000000000000000000000' + hexEvm;
  async function evm(label, rpc, chainName, contract) {
    try {
      const gas = await axios.post(rpc, { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [evm0x, 'latest'] }, { timeout: 10000 });
      const gasNum = Number(BigInt(gas.data.result || '0x0')) / 1e18;
      const bal = await axios.post(rpc, { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: contract, data: '0x70a08231' + pad32Evm }, 'latest'] }, { timeout: 10000 });
      const u = Number(BigInt(bal.data.result || '0x0')) / 1e6;
      console.log('  [' + label + '] addr=' + evm0x.slice(0,12) + '…  ' + chainName.padEnd(5) + ' gas=' + gasNum.toFixed(8) + '  USDT=' + u.toFixed(6));
      if (u > 0) console.log('    ★★★ FOUND USDT (' + u.toFixed(6) + ') on ' + label + '! WRONG NETWORK selected in Binance withdrawal.');
      return u;
    } catch (e) {
      console.log('  [' + label + '] failed: ' + e.message);
      return 0;
    }
  }
  await evm('BSC BEP-20', 'https://bsc-dataseed.binance.org', 'BNB', USDT_BEP20);
  await evm('Polygon ERC-20', 'https://polygon-rpc.com', 'MATIC', USDT_POLY);
  try {
    await evm('Ethereum ERC-20', 'https://cloudflare-eth.com', 'ETH', '0xdAC17F958D2ee523a2206206994597C13D831ec7');
  } catch {}

  console.log('');
  console.log('===== PRODUCTION WITHDRAWAL GATE (tronweb.service.ts#L77-L80) =====');
  console.log('  Code: if (trxBal < 20) throw Error("Need at least 20 TRX for gas")');
  console.log('  Code: if (usdtBal < amount) throw Error("Insufficient USDT")');
  console.log('');
  console.log('  → Update BSC_WALLET_ADDRESS and POLYGON_WALLET_ADDRESS in backend/.env to: ' + evm0x);
  console.log('    (if the EVM probe above found any USDT on BSC/Polygon.)');
})().catch(e => { console.error('\nERR:', e.message, e.stack); process.exit(1); });
