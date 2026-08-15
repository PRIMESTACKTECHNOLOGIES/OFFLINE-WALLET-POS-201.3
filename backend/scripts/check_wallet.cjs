require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const TronWeb = require('tronweb');

const privateKey = process.env.TRON_PRIVATE_KEY;
const savedAddress = process.env.TRON_WALLET_ADDRESS;

console.log('');
console.log('=== TRON HOT WALLET ===');
console.log('Saved Address  :', savedAddress || 'NOT SET');

if (privateKey) {
  try {
    const t = new TronWeb({
      fullNode: 'https://api.trongrid.io',
      solidityNode: 'https://api.trongrid.io',
      eventServer: 'https://api.trongrid.io',
      privateKey
    });
    const derived = t.address.fromPrivateKey(privateKey);
    console.log('Derived Address:', derived);
    console.log('TronScan URL   : https://tronscan.org/#/address/' + derived);
    console.log('');
    console.log('Fund this address with:');
    console.log('  1. USDT TRC-20 (for customer withdrawals)');
    console.log('  2. TRX (for gas — at least 200 TRX)');
    console.log('');
    console.log('TronWeb v5 loaded OK ✅');
  } catch(e) {
    console.log('ERROR:', e.message);
  }
} else {
  console.log('ERROR: TRON_PRIVATE_KEY not set in .env');
}
