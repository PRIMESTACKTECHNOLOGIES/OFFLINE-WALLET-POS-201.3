/**
 * Tron USDT TRC-20 Direct Service
 * Uses Tron HTTP API + ethers.js crypto (already installed)
 * No TronWeb SDK needed — pure HTTP calls
 *
 * .env:
 *   TRON_PRIVATE_KEY=your_hex_private_key
 *   TRON_WALLET_ADDRESS=your_TRC20_address
 *   TRON_API_KEY=optional_trongrid_key
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// USDT TRC-20 contract
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TRON_API     = 'https://api.trongrid.io';

function getHeaders() {
  const key = process.env.TRON_API_KEY?.trim();
  return key ? { 'TRON-PRO-API-KEY': key } : {};
}

function base58ToHex(addr: string): string {
  const bs58mod = require('bs58');
  const bs58 = bs58mod.default || bs58mod;
  const decoded: Buffer = Buffer.from(bs58.decode(addr));
  return decoded.slice(0, decoded.length - 4).toString('hex');
}

/** Sign a Tron transaction with private key */
function signTx(txHex: string, privateKey: string): string {
  const { ec: EC } = require('elliptic');
  const ec = new EC('secp256k1');
  const keyPair = ec.keyFromPrivate(privateKey, 'hex');

  const msgBuffer = Buffer.from(txHex, 'hex');
  // Tron uses sha256 of the raw tx data
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(msgBuffer).digest();

  const sig = keyPair.sign(hash, { canonical: true });
  const r = sig.r.toString('hex').padStart(64, '0');
  const s = sig.s.toString('hex').padStart(64, '0');
  const v = (sig.recoveryParam || 0).toString(16).padStart(2, '0');
  return r + s + v;
}

/** Get USDT TRC-20 balance of an address */
export async function getTrc20Balance(address: string): Promise<number> {
  try {
    const res = await axios.get(
      `${TRON_API}/v1/accounts/${address}`,
      { headers: getHeaders(), timeout: 10000 }
    );
    const tokens = res.data?.data?.[0]?.trc20 || [];
    for (const token of tokens) {
      if (token[USDT_CONTRACT] !== undefined) {
        return Number(token[USDT_CONTRACT]) / 1_000_000;
      }
    }
    return 0;
  } catch { return 0; }
}

/** Get TRX balance */
export async function getTrxBalance(address: string): Promise<number> {
  try {
    const res = await axios.get(
      `${TRON_API}/v1/accounts/${address}`,
      { headers: getHeaders(), timeout: 10000 }
    );
    const bal = res.data?.data?.[0]?.balance || 0;
    return Number(bal) / 1_000_000;
  } catch { return 0; }
}

/** Hot wallet address */
export function getHotWalletAddress(): string {
  const addr = process.env.TRON_WALLET_ADDRESS?.trim();
  if (!addr) throw new Error('TRON_WALLET_ADDRESS not set in .env');
  return addr;
}

// ── Treasury wallet (holds real USDT; hot wallet = gas ONLY) ──

export function isTreasuryConfigured(): boolean {
  return !!(process.env.TRON_TREASURY_PRIVATE_KEY?.trim() && process.env.TRON_TREASURY_ADDRESS?.trim());
}
export function getTreasuryPrivateKey(): string {
  const key = process.env.TRON_TREASURY_PRIVATE_KEY?.trim();
  if (!key) throw new Error('TRON_TREASURY_PRIVATE_KEY not set in .env');
  return key;
}
export function getTreasuryAddress(): string {
  const addr = process.env.TRON_TREASURY_ADDRESS?.trim();
  if (!addr) throw new Error('TRON_TREASURY_ADDRESS not set in .env');
  return addr;
}
export async function getTreasuryUsdtBalance(): Promise<number> {
  if (!isTreasuryConfigured()) return 0;
  return getTrc20Balance(getTreasuryAddress());
}
export async function getTreasuryTrxBalance(): Promise<number> {
  if (!isTreasuryConfigured()) return 0;
  return getTrxBalance(getTreasuryAddress());
}

/**
 * Send USDT TRC-20 — selectable sender wallet.
 * Uses Tron HTTP API — no TronWeb SDK needed
 *
 * Sender selection (critical for NO-USDT-on-hot-wallet model):
 *  • useTreasury=true  → TREASURY wallet signs & sends (source of real USDT for settlement)
 *  • useTreasury=false → HOT wallet signs & sends (may defer if no USDT)
 *  • auto: treasury first (if configured + has USDT); else hot wallet.
 *
 * ARCHITECTURAL CHANGE (per operator directive):
 *  • Hot wallet USDT balance is NEVER a hard requirement
 *  • Internal wallet deduction (customer/merchant) is FINAL — no rollback
 *  • If active sender lacks on-chain USDT: return { deferred: true, status: 'deferred' }
 *    → NOT an error. This is an auto-retryable state ("deferred_broadcast").
 *  • Only TRX (native gas) is checked as hard requirement for broadcast path.
 *    If gas is missing → throw (that IS pending_manual — human must top up).
 */
export async function sendUsdt(toAddress: string, amount: number, opts?: {
  useTreasury?: boolean | 'auto';
}): Promise<{
  txId?: string;
  amount: number;
  from: string;
  to: string;
  network: 'tron';
  deferred?: boolean;
  status?: 'broadcast' | 'deferred';
  note?: string;
  hotWalletUsdtBalance?: number;
  hotWalletTrxBalance?: number;
  treasuryUsdtBalance?: number;
  treasuryTrxBalance?: number;
  senderRole?: 'hot' | 'treasury';
}> {
  if (!toAddress?.startsWith('T') || toAddress.length < 34) {
    throw new Error(`Invalid TRC-20 address: "${toAddress}". Must start with T.`);
  }
  if (amount <= 0) throw new Error('Amount must be > 0');

  const useTreasury = opts?.useTreasury ?? 'auto';
  const treasuryConfigured = isTreasuryConfigured();

  let senderRole: 'hot' | 'treasury';
  if (useTreasury === true) senderRole = 'treasury';
  else if (useTreasury === false) senderRole = 'hot';
  else {
    const tUsdtBal = treasuryConfigured ? await getTreasuryUsdtBalance() : 0;
    senderRole = (treasuryConfigured && tUsdtBal >= amount) ? 'treasury' : 'hot';
  }

  if (senderRole === 'treasury' && !treasuryConfigured) {
    throw new Error('TRON treasury wallet is not configured. Set TRON_TREASURY_PRIVATE_KEY + TRON_TREASURY_ADDRESS in .env.');
  }

  const from = senderRole === 'treasury' ? getTreasuryAddress() : getHotWalletAddress();
  const privateKey = senderRole === 'treasury' ? getTreasuryPrivateKey()
    : (process.env.TRON_PRIVATE_KEY?.trim() || (() => { throw new Error('TRON_PRIVATE_KEY not set in .env'); })());

  const usdtBal = senderRole === 'treasury' ? await getTreasuryUsdtBalance() : await getTrc20Balance(from);
  const trxBal = senderRole === 'treasury' ? await getTreasuryTrxBalance() : await getTrxBalance(from);

  if (trxBal < 20) {
    throw new Error(
      `${senderRole === 'treasury' ? 'Treasury' : 'Hot'} wallet needs 20+ TRX for gas. Has ${trxBal.toFixed(2)} TRX. Fund: ${from}`
    );
  }

  if (usdtBal < amount) {
    return {
      amount,
      from,
      to: toAddress,
      network: 'tron',
      deferred: true,
      status: 'deferred',
      note:
        `On-chain USDT broadcast deferred — ${senderRole === 'treasury' ? 'treasury' : 'hot'} wallet has ${usdtBal.toFixed(2)} USDT, needs ${amount}. ` +
        `Wallet ${from} will deliver ${amount} USDT to ${toAddress} once USDT balance is sufficient. ` +
        `Gas (TRX) will be paid from ${senderRole} wallet native reserve. ` +
        `Internal ledger entry is FINAL — no rollback, no refund required.` +
        (senderRole === 'hot' && treasuryConfigured
          ? ` (Tip: Treasury wallet exists — try the treasury sender path.)`
          : ''),
      hotWalletUsdtBalance: senderRole === 'hot' ? usdtBal : undefined,
      hotWalletTrxBalance: senderRole === 'hot' ? trxBal : undefined,
      treasuryUsdtBalance: senderRole === 'treasury' ? usdtBal : undefined,
      treasuryTrxBalance: senderRole === 'treasury' ? trxBal : undefined,
      senderRole,
    };
  }

  const amountSun = Math.floor(amount * 1_000_000).toString();

  // Step 1: Build TRC-20 transfer transaction
  const buildRes = await axios.post(
    `${TRON_API}/wallet/triggersmartcontract`,
    {
      owner_address: from,
      contract_address: USDT_CONTRACT,
      function_selector: 'transfer(address,uint256)',
      parameter: encodeAbiParams(toAddress, amountSun),
      fee_limit: 100000000,
      call_value: 0,
      visible: true,
    },
    { headers: { ...getHeaders(), 'Content-Type': 'application/json' }, timeout: 15000 }
  );

  if (!buildRes.data?.transaction) {
    throw new Error(`Failed to build transaction: ${JSON.stringify(buildRes.data)}`);
  }

  const rawTx = buildRes.data.transaction;
  const txHex = rawTx.raw_data_hex;

  // Step 2: Sign
  const signature = signTx(txHex, privateKey);
  rawTx.signature = [signature];

  // Step 3: Broadcast
  const broadcastRes = await axios.post(
    `${TRON_API}/wallet/broadcasttransaction`,
    rawTx,
    { headers: { ...getHeaders(), 'Content-Type': 'application/json' }, timeout: 15000 }
  );

  if (!broadcastRes.data?.result) {
    throw new Error(`Broadcast failed: ${JSON.stringify(broadcastRes.data)}`);
  }

  const txId = rawTx.txID;
  console.log(`[Tron] ✅ [${senderRole.toUpperCase()}] Sent ${amount} USDT → ${toAddress}  txId=${txId}  from=${from}`);

  return {
    txId,
    amount,
    from,
    to: toAddress,
    network: 'tron',
    deferred: false,
    status: 'broadcast',
    hotWalletUsdtBalance: senderRole === 'hot' ? usdtBal : undefined,
    hotWalletTrxBalance: senderRole === 'hot' ? trxBal : undefined,
    treasuryUsdtBalance: senderRole === 'treasury' ? usdtBal : undefined,
    treasuryTrxBalance: senderRole === 'treasury' ? trxBal : undefined,
    senderRole,
  };
}

/** Encode ABI params for TRC-20 transfer(address,uint256) */
function encodeAbiParams(toAddress: string, amountStr: string): string {
  // Convert base58 TRC20 address to 32-byte padded hex
  const bs58 = require('bs58');
  const decoded: Buffer = bs58.decode(toAddress);
  // Remove 4-byte checksum + replace first byte (0x41) with 0x00...address
  const rawHex = decoded.slice(0, decoded.length - 4).toString('hex');
  // Remove first byte (0x41 version byte) → 20 bytes address
  const addrHex = rawHex.slice(2); // remove '41' prefix
  const addrPadded = addrHex.padStart(64, '0');

  // Amount as 32-byte hex
  const amtBig = BigInt(amountStr);
  const amtHex = amtBig.toString(16).padStart(64, '0');

  return addrPadded + amtHex;
}

/** Generate a new Tron wallet (utility) */
export function generateTronWallet(): { address: string; privateKey: string } {
  const crypto = require('crypto');
  const { ec: EC } = require('elliptic');
  const { keccak256 } = require('js-sha3');
  const bs58mod = require('bs58');
  const bs58 = bs58mod.default || bs58mod;
  const ec = new EC('secp256k1');

  const privateKey = crypto.randomBytes(32).toString('hex');
  const keyPair = ec.keyFromPrivate(privateKey, 'hex');
  const pubKey = keyPair.getPublic(false, 'hex').slice(2);
  const hash = keccak256(Buffer.from(pubKey, 'hex'));
  const ethAddr = hash.slice(-40);
  const tronHex = '41' + ethAddr;
  const addrBytes = Buffer.from(tronHex, 'hex');
  const h1 = crypto.createHash('sha256').update(addrBytes).digest();
  const h2 = crypto.createHash('sha256').update(h1).digest();
  const checksum = h2.slice(0, 4);
  const fullBytes = Buffer.concat([addrBytes, checksum]);
  const address = bs58.encode(fullBytes);
  return { address, privateKey };
}
