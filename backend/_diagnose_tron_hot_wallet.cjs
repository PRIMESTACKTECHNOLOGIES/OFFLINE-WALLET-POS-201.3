require('dotenv').config();
const axios = require('axios');

const HOT = 'TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP';
const API = process.env.TRONGRID_API_KEY?.trim() || '';
const H = API ? { 'TRON-PRO-API-KEY': API } : {};
const NODE = API ? 'https://api.trongrid.io' : 'https://api.trongrid.io';

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';  // Tether USDT TRC-20

(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TRON HOT WALLET — LIVE BALANCE + ENERGY/BANDWIDTH CHECK  ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` Hot address : ${HOT}`);
  console.log(` Trongrid key: ${API ? API.slice(0, 10) + '… (len=' + API.length + ')' : 'NOT SET (rate-limited public)'}`);
  console.log(` Node        : ${NODE}\n`);

  const tryGet = async (p, extra) => {
    try {
      const r = await axios.get(`${NODE}${p}`, { headers: H, timeout: 15000, params: extra });
      return r.data;
    } catch (e) {
      return { error: true, status: e.response?.status, msg: e.response?.data?.Error || e.message };
    }
  };
  const tryPost = async (p, body) => {
    try {
      const r = await axios.post(`${NODE}${p}`, body || {}, { headers: { ...H, 'Content-Type': 'application/json' }, timeout: 15000 });
      return r.data;
    } catch (e) {
      return { error: true, status: e.response?.status, msg: e.response?.data?.Error || e.message };
    }
  };

  // ── 1. Account (TRX balance + create time) ──────────────────
  console.log('1. TRX balance (native TRX, used as gas + amount for TRX payouts):');
  const acc = await tryGet(`/wallet/getaccount`, { address: HOT, visible: true });
  if (acc.error) { console.log('   ❌', acc.msg, `(HTTP ${acc.status})`); }
  else {
    const trx = Number(acc.balance ?? 0) / 1e6;
    console.log(`   TRX balance : ${trx.toFixed(6)} TRX`);
    console.log(`   Free net limit (cpu bandwidth): ${acc.free_net_limit ?? 0} bytes, used: ${acc.free_net_used ?? 0}  →  remain: ${(acc.free_net_limit ?? 0) - (acc.free_net_used ?? 0)}`);
    console.log(`   Energy limit                 : ${acc.energy_limit ?? 0}, used: ${acc.energy_used ?? 0}  →  remain: ${(acc.energy_limit ?? 0) - (acc.energy_used ?? 0)}`);
    console.log(`   Account create time          : ${acc.create_time ? new Date(acc.create_time).toISOString() : '(not activated?)'}`);
    console.log(`   owner_permission.address     : ${acc.owner_permission?.keys?.[0]?.address ?? '(unknown)'}`);

    if (trx < 25) {
      console.log(`   ⚠️  UNDERFUNDED — TRX gas buffer is ${trx.toFixed(2)} TRX but USDT-TRC20 sends need ~15-25 TRX in`);
      console.log(`      burn+fees for ~10 payouts. Recommend topping to MINIMUM 25 TRX for gas reserve.`);
      console.log(`      Shortfall: ${(25 - trx).toFixed(2)} TRX  (~$${(0.12 * (25 - trx)).toFixed(2)} market)`);
    } else {
      console.log(`   ✅ TRX buffer sufficient (≥25 TRX target).`);
    }
  }

  // ── 2. USDT TRC-20 balance via contract trigger ─────────────
  console.log('\n2. USDT-TRC20 balance (Tether contract TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t):');
  // balanceOf(address) = method id 0x70a08231, address padded to 32 bytes left-aligned (hex + 0x prefix → 32 bytes).
  // Convert HOT (base58check) → hex address via getaccount.
  const hexAddr = acc?.address_hex;
  if (!hexAddr) { console.log('   ⏭️  Cannot compute USDT balance (getaccount did not return address_hex).'); }
  else {
    const param = '0x' + '70a08231' + hexAddr.replace(/^0x/, '').padStart(64, '0');
    const usdtResp = await tryPost(`/wallet/triggersmartcontract`, {
      owner_address: HOT,
      contract_address: USDT_CONTRACT,
      function_selector: 'balanceOf(address)',
      parameter: hexAddr.replace(/^0x/, '').padStart(64, '0'),
      visible: true,
    });
    if (usdtResp.error) { console.log('   ❌', usdtResp.msg); }
    else {
      const resultHex = usdtResp?.constant_result?.[0];
      const usdtNum = resultHex ? Number(BigInt('0x' + resultHex) / BigInt('1000000')) : 0;
      // BigInt/Number safe for USDT quantities up to 2^53 / 1e6 ≈ $9T
      const usdt = resultHex ? (parseIntBigIntFixed(resultHex)) : 0;
      function parseIntBigIntFixed(hex) {
        // safe: USDT max supply 84B, 6 decimals → max uint = 84e12 < 2^53
        let v = 0n;
        for (const ch of hex.toLowerCase()) v = (v << 4n) + BigInt('0123456789abcdef'.indexOf(ch));
        return Number(v) / 1e6;
      }
      console.log(`   USDT balance : ${usdt.toFixed(6)} USDT`);
      if (usdt === 0) {
        console.log(`   ❌ EMPTY — direct TRON rail for USDT payouts is BLOCKED.`);
        console.log(`      Deposit USDT TRC-20 from Binance to ${HOT} (at least ${5 + 1} USDT to cover first 5-min-withdraw + 1.5 TRC-20 fee from Binance).`);
      } else {
        console.log(`   ✅ Has USDT liquidity; ${usdt.toFixed(2)} USDT ready for payout via direct TRON rail.`);
      }
    }
  }

  // ── 3. Recent transactions (for traceability) ───────────────
  console.log('\n3. Last 3 transactions on hot wallet (for audit trail):');
  const txns = await tryGet(`/v1/accounts/${HOT}/transactions`, { limit: 3 });
  const arr = txns?.data || txns;
  if (!Array.isArray(arr) || !arr.length) console.log('   (none returned / rate limited)');
  else arr.slice(0, 3).forEach((t, i) => {
    const v = t.raw_data?.contract?.[0]?.parameter?.value;
    const amount = (v?.amount ? Number(v.amount) / 1e6 + ' TRX' : v?.contract_address ? '(TRC-20 call)' : '') || '(contract/internal)';
    console.log(`   ${i + 1}. txId=${t.txID?.slice(0, 16)}…  amount≈${amount}  block=${t.blockNumber ?? '?'}  ret=${t.ret?.[0]?.contractRet ?? 'UNKNOWN'}  ts=${t.block_timestamp ? new Date(t.block_timestamp).toISOString() : '(pending)'}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SUMMARY OF DIRECT TRON RAIL READINESS');
  console.log('═══════════════════════════════════════════════════════════');
  const trxBal = (acc?.balance ? Number(acc.balance) / 1e6 : 0);
  if (trxBal >= 25) {
    // USDT liquidity check
  }
  process.exit(0);
})().catch(e => {
  console.error('💥 UNHANDLED:', e.message);
  process.exit(1);
});
