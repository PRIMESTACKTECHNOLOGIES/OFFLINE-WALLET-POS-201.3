require('dotenv').config();
const axios = require('axios');

const HOT = 'TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP';
const NODE = 'https://api.trongrid.io';
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

(async () => {
  // 1. base58 → hex address
  try {
    const { default: bs58 } = await import('bs58');
    const bytes = bs58.decode(HOT);
    const hex = '0x' + Buffer.from(bytes.slice(0, 21)).toString('hex');
    console.log('Hot address base58:', HOT);
    console.log('Hot address hex (41-prefixed / Tron format):', hex);
    console.log('');

    // 2. Trigger USDT balanceOf(hex_address_padded_32)
    const param = hex.slice(2).padStart(64, '0');
    const r = await axios.post(`${NODE}/wallet/triggersmartcontract`, {
      owner_address: HOT,
      contract_address: USDT,
      function_selector: 'balanceOf(address)',
      parameter: param,
      visible: true,
    }, { timeout: 15000 });
    const resultHex = r.data?.constant_result?.[0];
    if (!resultHex) {
      console.log('constant_result empty. Full response =', JSON.stringify(r.data).slice(0, 600));
    } else {
      let v = 0n;
      for (const ch of resultHex.toLowerCase()) v = (v << 4n) + BigInt('0123456789abcdef'.indexOf(ch));
      const usdt = Number(v) / 1e6;
      console.log(`💵 USDT TRC-20 balance of ${HOT}:  ${usdt.toFixed(6)} USDT`);
      if (usdt === 0) {
        console.log('   ❌ ZERO USDT. To activate the direct TRON bypass rail (the 0 Travel Rule 0 Binance path):');
        console.log('      Withdraw USDT from Binance Spot → network TRC20 → destination = this hot wallet address.');
        console.log('      Binance minWithdraw for USDT-TRC20 = 5 USDT, fee=1.5 USDT → send at least 6.5 USDT');
        console.log('      to net 5 USDT after network fee.');
      } else {
        console.log('   ✅ Has USDT liquidity ready for direct TRON payouts (Tier 1 of routing).');
      }
    }
  } catch (e) {
    console.log('Error:', e.message, e.response?.data);
  }
})();
