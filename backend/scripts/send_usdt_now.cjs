/**
 * Direct USDT TRC-20 send — no TronWeb SDK, pure HTTP
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const crypto = require('crypto');
const bs58 = require('bs58').default || require('bs58');
const { ec: EC } = require('elliptic');

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TRON_API      = 'https://api.trongrid.io';

const PRIVATE_KEY   = process.env.TRON_PRIVATE_KEY;
const FROM_ADDRESS  = process.env.TRON_WALLET_ADDRESS;
const TO_ADDRESS    = process.argv[2] || 'TCjaTRox9EfvrD47fnH9mcAbdTiGB6iHWC';
const AMOUNT_USDT   = parseFloat(process.argv[3] || '1');

function base58ToHex(addr) {
  const decoded = Buffer.from(bs58.decode(addr));
  return decoded.slice(0, decoded.length - 4).toString('hex');
}

function encodeAbiParams(toAddr, amountStr) {
  const rawHex = base58ToHex(toAddr);
  const addrHex = rawHex.slice(2); // remove '41' prefix → 20 bytes
  const addrPadded = addrHex.padStart(64, '0');
  const amtHex = BigInt(amountStr).toString(16).padStart(64, '0');
  return addrPadded + amtHex;
}

function signTransaction(txHex, privKey) {
  const ec = new EC('secp256k1');
  const keyPair = ec.keyFromPrivate(privKey, 'hex');
  const msgBuffer = Buffer.from(txHex, 'hex');
  const hash = crypto.createHash('sha256').update(msgBuffer).digest();
  const sig = keyPair.sign(hash, { canonical: true });
  const r = sig.r.toString('hex').padStart(64, '0');
  const s = sig.s.toString('hex').padStart(64, '0');
  const v = (sig.recoveryParam || 0).toString(16).padStart(2, '0');
  return r + s + v;
}

async function sendUsdt() {
  const amountSun = Math.floor(AMOUNT_USDT * 1_000_000).toString();

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(' USDT TRC-20 TRANSFER');
  console.log('═══════════════════════════════════════');
  console.log(' From    :', FROM_ADDRESS);
  console.log(' To      :', TO_ADDRESS);
  console.log(' Amount  :', AMOUNT_USDT, 'USDT');
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log('Building transaction...');

  // Step 1: Build
  const buildRes = await axios.post(`${TRON_API}/wallet/triggersmartcontract`, {
    owner_address: FROM_ADDRESS,
    contract_address: USDT_CONTRACT,
    function_selector: 'transfer(address,uint256)',
    parameter: encodeAbiParams(TO_ADDRESS, amountSun),
    fee_limit: 100000000,
    call_value: 0,
    visible: true,
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

  if (!buildRes.data?.transaction) {
    console.log('❌ Build failed:', JSON.stringify(buildRes.data));
    process.exit(1);
  }

  const rawTx = buildRes.data.transaction;
  console.log('✅ Transaction built. TxID:', rawTx.txID);

  // Step 2: Sign
  console.log('Signing...');
  const signature = signTransaction(rawTx.raw_data_hex, PRIVATE_KEY);
  rawTx.signature = [signature];

  // Step 3: Broadcast
  console.log('Broadcasting to Tron network...');
  const broadcastRes = await axios.post(`${TRON_API}/wallet/broadcasttransaction`,
    rawTx,
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );

  if (broadcastRes.data?.result === true) {
    console.log('');
    console.log('✅ SUCCESS! Transaction sent!');
    console.log('');
    console.log('  TxID:', rawTx.txID);
    console.log('  View: https://tronscan.org/#/transaction/' + rawTx.txID);
    console.log('');
  } else {
    console.log('❌ Broadcast failed:', JSON.stringify(broadcastRes.data));
  }
}

sendUsdt().catch(e => {
  console.log('❌ ERROR:', e.response?.data || e.message);
  process.exit(1);
});
