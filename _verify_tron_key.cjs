// Verify: does the TRON_PRIVATE_KEY in backend/.env actually derive to
// address TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP?
// Local-only derivation, no network. Uses TronWeb's internal account util.

const path = require('path');
require(path.join(__dirname, 'backend', 'node_modules', 'dotenv')).config({ path: path.join(__dirname, 'backend', '.env') });

const EXPECTED_ADDR = 'TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP';
const pk = (process.env.TRON_PRIVATE_KEY || '').trim();

console.log('===== TRON PRIVATE-KEY ↔ ADDRESS OWNERSHIP VERIFICATION =====\n');
console.log('Expected address   : ' + EXPECTED_ADDR);
console.log('TRON_PRIVATE_KEY   : ' + (!pk || pk.includes('your_') || pk.includes('REPLACE') || pk.length < 60 ? 'PLACEHOLDER (not a real key — derivation SKIPPED)' : pk.slice(0, 6) + '…' + pk.slice(-4) + ' (len=' + pk.length + ')'));
console.log('');

if (!pk || pk.includes('your_') || pk.includes('REPLACE') || pk.length < 60) {
  console.log('⚠ TRON_PRIVATE_KEY in backend/.env line 69 is still the string');
  console.log('  "your_hot_wallet_private_key_without_0x_prefix" → it is NOT a real private key.');
  console.log('');
  console.log('CONSEQUENCES:');
  console.log('  • The tronweb service CANNOT sign outgoing USDT TRC-20 transactions.');
  console.log('  • Any merchant /customer crypto withdrawal via TRC-20 rail will FAIL at');
  console.log('    sendUsdt() step with: "TRON_PRIVATE_KEY is not set in .env".');
  console.log('  • Even though ~18.5 USDT and 14.18 TRX EXISTS ON-CHAIN at this address,');
  console.log('    the POS software cannot spend it because it does not possess the signer key.');
  console.log('');
  console.log('ACTION NEEDED: Paste the real 64-char hex private key for TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP');
  console.log('  into backend/.env line 69. If you used a TronLink or Klever wallet to create the address,');
  console.log('  export the private key from that wallet as HEX (no 0x, no TRON-PRO key).');
  process.exit(0);
}

// Real key present. Derive and verify address locally.
// TronWeb uses secp256k1 → keccak256 → last 20 bytes → prepend 0x41 → base58check.
// We use TronWeb from node_modules to ensure the same code path as production.
process.chdir(path.join(__dirname, 'backend'));
try {
  const secp = require(path.join(__dirname, 'backend', 'node_modules', '@noble', 'secp256k1'));
  const keccak = (() => { try { return require('ethereum-cryptography/keccak').keccak256; } catch { return require(path.join(__dirname, 'backend', 'node_modules', 'ethereum-cryptography', 'keccak')).keccak256;}})();
} catch {}
const { execSync } = require('child_process');
const res = execSync(process.execPath + ' -e ' + JSON.stringify(
  "process.chdir('" + path.join(__dirname, 'backend').replace(/'/g,"''") + "');" +
  "const pk=process.argv[1];" +
  "const {TronWeb}=require('tronweb');" +
  "const w=new TronWeb({fullNode:'https://'});" +
  "const addr=w.address.fromPrivateKey(pk);" +
  "console.log('DERIVED='+addr);"
), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
console.log(res);
const match = /DERIVED=(T\w+)/.exec(res);
if (match) {
  const derived = match[1];
  const ok = derived === EXPECTED_ADDR;
  console.log('  Match: ' + (ok ? '✅ YES — private key is the correct owner.' : '❌ NO — private key controls address ' + derived.slice(0,12) + '…, not ' + EXPECTED_ADDR.slice(0,12) + '…'));
  if (!ok) {
    console.log('\n  ⚠ FATAL: TRON_PRIVATE_KEY does NOT control the configured address.');
    console.log('    Withdrawals would either sign from the WRONG wallet or fail silently.');
    console.log('    Fix backend/.env immediately.');
  }
}
