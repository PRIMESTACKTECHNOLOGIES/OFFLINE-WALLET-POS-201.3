/**
 * Generate a new Tron hot wallet for USDT TRC-20 withdrawals
 * Run: node backend/scripts/generate_tron_wallet.js
 *
 * IMPORTANT: Save the private key securely. Never commit it to git.
 * Add to backend/.env:
 *   TRON_PRIVATE_KEY=<privateKey shown below>
 *   TRON_WALLET_ADDRESS=<address shown below>
 *
 * Then fund this address with:
 *   - USDT (TRC-20) — for sending to customers
 *   - TRX — for gas fees (at least 100 TRX recommended)
 */

const TronWeb = require('tronweb');

const tronWeb = new TronWeb({
  fullNode: 'https://api.trongrid.io',
  solidityNode: 'https://api.trongrid.io',
  eventServer: 'https://api.trongrid.io',
});

const account = tronWeb.utils.accounts.generateAccount();

console.log('');
console.log('════════════════════════════════════════════════');
console.log('  NEW TRON HOT WALLET GENERATED');
console.log('════════════════════════════════════════════════');
console.log('');
console.log('Address (TRC-20):  ', account.address.base58);
console.log('Private Key:       ', account.privateKey);
console.log('');
console.log('Add to backend/.env:');
console.log('  TRON_PRIVATE_KEY=' + account.privateKey);
console.log('  TRON_WALLET_ADDRESS=' + account.address.base58);
console.log('');
console.log('Fund this address with:');
console.log('  1. At least 200 TRX (for gas fees)');
console.log('  2. USDT TRC-20 (for customer withdrawals)');
console.log('');
console.log('View on TronScan:');
console.log('  https://tronscan.org/#/address/' + account.address.base58);
console.log('════════════════════════════════════════════════');
