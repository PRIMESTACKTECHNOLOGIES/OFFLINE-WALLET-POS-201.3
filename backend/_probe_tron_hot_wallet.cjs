require('dotenv').config();
const axios = require('axios');

// Load current configured hot wallet
const PK = process.env.TRON_PRIVATE_KEY?.trim() || '';
const ADDR = process.env.TRON_WALLET_ADDRESS?.trim() || '';
const GRID = process.env.TRON_API_KEY?.trim() || '';
const NODE = process.env.TRON_FULL_NODE || 'https://api.trongrid.io';

const H = GRID ? { 'TRON-PRO-API-KEY': GRID } : {};
const GET = async p => (await axios.get(NODE + p, { headers: H, timeout: 20000 })).data;

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // mainnet

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  TRON HOT WALLET — LIVE BALANCE PROBE (TRC-20 USDT + TRX GAS)');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  console.log(`  Node          : ${NODE}`);
  console.log(`  Trongrid Key  : ${GRID ? '✅ ' + GRID.slice(0,8) + '…' : '❌ not set (limited API calls/day, 1 per sec)'}`);
  console.log(`  Hot Address   : ${ADDR || '(NOT SET — will derive from private key)'}`);
  console.log(`  Private Key   : ${PK ? '✅ set  len=' + PK.length + '  prefix=' + PK.slice(0, 8) + '…' : '❌ NOT SET — CANNOT WITHDRAW'}\n`);

  if (!PK || !ADDR) { console.log('  ❌ Keys missing. Set TRON_PRIVATE_KEY & TRON_WALLET_ADDRESS in .env'); process.exit(1); }

  // Derive address from PK for double-check
  try {
    const TronWeb = require('tronweb');
    const tw = new TronWeb({ fullNode: NODE, solidityNode: NODE, eventServer: NODE, privateKey: PK, headers: H });
    const derived = tw.address.fromPrivateKey(PK);
    console.log(`  Derived Addr  : ${derived}   ${derived === ADDR ? '✅ matches TRON_WALLET_ADDRESS' : '⚠ MISMATCH! .env has different address; using derived one'}`);
    ADDR_real = (derived === ADDR) ? ADDR : derived;
  } catch (e) { console.log(`  tronweb not installed? ${e.message}`); process.exit(2); }

  // 1. TRX balance
  try {
    const acc = await GET(`/wallet/getaccount?address=${ADDR_real}&visible=true`);
    const trx = Number(acc.balance ?? 0) / 1_000_000;
    console.log(`\n  ┌─ TRX (GAS / NETWORK COIN) ─────────────────────────────`);
    console.log(`  │ Balance : ${trx.toFixed(6)} TRX   ($${(trx * 0.12).toFixed(2)} @ ~$0.12/TRX)`);
    console.log(`  │ Bandwidth : ${acc.frozen_balance_for_bandwidth ? ((acc.frozen_balance_for_bandwidth.frozen_balance||0)/1e6).toFixed(2)+' TRX staked' : '0 (unstaked)'}  Energy : ${acc.frozen_balance_for_energy ? ((acc.frozen_balance_for_energy.frozen_balance||0)/1e6).toFixed(2)+' TRX staked' : '0 (unstaked)'}`);
    const minGas = 20;
    console.log(`  │ Gas needed: ${minGas} TRX min.  ${trx >= minGas ? '✅ SUFFICIENT for unlimited USDT transfers' : `❌ NEED ${(minGas-trx).toFixed(2)} TRX MORE gas — fund address with TRX on TronScan`}`);
  } catch (e) { console.log('  TRX balance ERR:', e.message); }

  // 2. USDT TRC-20 balance
  try {
    const r = await GET(`/wallet/triggerconstantcontract?address=${ADDR_real}&owner_address=${ADDR_real}&function_selector=balanceOf(address)&parameter=${ADDR_real.slice(2).padStart(64,'0')}&contract_address=${USDT_CONTRACT}&visible=true`);
    if (r?.constant_result?.[0]) {
      const raw = BigInt('0x' + r.constant_result[0]);
      const usdt = Number(raw) / 1_000_000;
      console.log(`\n  ┌─ USDT TRC-20 (PRIMARY PAYOUT COIN) ────────────────────`);
      console.log(`  │ Balance : $${usdt.toLocaleString(undefined,{maximumFractionDigits:6})} USDT`);
      console.log(`  │ Contract: ${USDT_CONTRACT}`);
      if (usdt < 1) console.log(`  │ ⚠  USDT HOT WALLET IS LOW. Deposit at least $20 USDT TRC-20 into ${ADDR_real} on TronScan.`);
      else console.log(`  │ ✅ USDT AVAILABLE — CAN EXECUTE LIVE WITHDRAWALS up to $${usdt.toFixed(2)}`);
    } else console.log('  USDT read error: result empty');
  } catch (e) { console.log('  USDT ERR:', e.message); }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  HOW TO USE: POST /api/wallets/crypto-withdraw');
  console.log('  body = { customerId, cryptoCoin:"USDT", amount: 10, ');
  console.log('           address:"TDSu93pW…", network:"TRX" }          ← net must be TRX/TRC20/TRON');
  console.log('  → calls tronweb.sendUsdt() directly — NO EXCHANGE, NO TRAVEL RULE.');
  console.log('═══════════════════════════════════════════════════════════════════\n');
})().catch(e => { console.error('\n💥', e.message); process.exit(1); });
