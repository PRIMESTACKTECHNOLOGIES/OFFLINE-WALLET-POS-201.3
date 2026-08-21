/**
 * walletGen.ts — BIP-44 HD Wallet Address Generator
 *
 * Derives real blockchain addresses from a master seed phrase stored in .env.
 * Each customer gets a unique deterministic address per network, derived from
 * their index in the HD path — no private keys are stored in the DB.
 *
 * .env keys required:
 *   WALLET_MASTER_MNEMONIC=<12 or 24 word BIP-39 seed phrase>
 *
 * BIP-44 derivation paths used:
 *   EVM (ETH / BSC / Polygon):  m/44'/60'/0'/0/<index>
 *   Tron (TRC-20):              m/44'/195'/0'/0/<index>
 *   Bitcoin:                    m/44'/0'/0'/0/<index>
 *   Solana:                     m/44'/501'/0'/0/<index>  (ed25519 — approximated via secp256k1)
 *
 * SECURITY NOTES:
 *  • The master mnemonic MUST be kept in .env and NEVER committed to git.
 *  • Private keys are derived on-the-fly and never persisted to the DB.
 *  • For production, consider a KMS (AWS KMS / HashiCorp Vault) to store the mnemonic.
 *  • Index-per-customer: store the derivation index in customer_crypto_wallets_v2.
 */

import crypto from 'crypto';

// ── Lazy loaders (keeps startup fast; libs only loaded when needed) ──────────
let bip39Cache: any = null;
let bip32Cache: any = null;
let ethersCache: any = null;

async function getBip39() {
  if (!bip39Cache) bip39Cache = await import('@scure/bip39');
  return bip39Cache;
}

async function getBip32() {
  if (!bip32Cache) bip32Cache = await import('@scure/bip32');
  return bip32Cache;
}

async function getEthers() {
  if (!ethersCache) ethersCache = await import('ethers');
  return ethersCache;
}

// ── Tron address helpers ─────────────────────────────────────────────────────

/**
 * Convert a compressed public key (33 bytes) → Tron base58check address.
 * Tron addresses follow the same ECDSA key as Ethereum but use a different
 * prefix (0x41 instead of 0x00) and base58check encoding.
 */
function pubKeyToTronAddress(compressedPubKey: Uint8Array): string {
  // 1. Uncompressed public key via ethers (strips leading 0x04, takes last 64 bytes)
  const { ec: EC } = require('elliptic');
  const ec = new EC('secp256k1');
  const key = ec.keyFromPublic(Buffer.from(compressedPubKey).toString('hex'), 'hex');
  const uncompressed = Buffer.from(key.getPublic().encode('array', false)); // 65 bytes, starts with 04
  const pubKeyBody = uncompressed.slice(1); // 64 bytes

  // 2. keccak256 of the 64-byte body → take last 20 bytes → Ethereum-style address
  const keccak = require('js-sha3').keccak256;
  const hash = Buffer.from(keccak.arrayBuffer(pubKeyBody)); // 32 bytes
  const ethAddress = hash.slice(12); // last 20 bytes

  // 3. Prepend Tron network prefix 0x41
  const tronRaw = Buffer.concat([Buffer.from([0x41]), ethAddress]); // 21 bytes

  // 4. Double SHA-256 checksum (first 4 bytes)
  const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest();
  const checksum = sha256(sha256(tronRaw)).slice(0, 4);

  // 5. Base58 encode
  const bs58 = require('bs58');
  return bs58.encode(Buffer.concat([tronRaw, checksum]));
}

// ── Core derive function ─────────────────────────────────────────────────────

export interface DerivedWallet {
  address: string;
  network: 'tron' | 'evm' | 'bitcoin';
  coin: string;
  derivationPath: string;
  index: number;
}

/**
 * Derive a wallet address for a given network and customer index.
 *
 * @param network  'tron' | 'evm' | 'bitcoin'
 * @param index    Customer-specific derivation index (store this in DB)
 * @param coin     Human-readable coin name (for labelling only)
 */
export async function deriveWallet(
  network: 'tron' | 'evm' | 'bitcoin',
  index: number,
  coin: string = 'USDT'
): Promise<DerivedWallet> {
  const mnemonic = process.env.WALLET_MASTER_MNEMONIC?.trim();
  if (!mnemonic) {
    throw new Error(
      'WALLET_MASTER_MNEMONIC is not set in .env. ' +
      'Generate one with: node -e "const b=require(\'@scure/bip39\');const w=b.wordlists.english;console.log(b.generateMnemonic(w,256))"'
    );
  }

  const bip39 = await getBip39();
  const { HDKey } = await getBip32();

  // Validate mnemonic
  const wordlist = bip39.wordlists.english;
  if (!bip39.validateMnemonic(mnemonic, wordlist)) {
    throw new Error('WALLET_MASTER_MNEMONIC is not a valid BIP-39 mnemonic.');
  }

  // Derive seed (synchronous, no passphrase)
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);

  let path: string;
  let address: string;

  if (network === 'evm') {
    // BIP-44 path for Ethereum / BSC / Polygon
    path = `m/44'/60'/0'/0/${index}`;
    const child = root.derive(path);
    if (!child.privateKey) throw new Error(`Failed to derive EVM key at ${path}`);
    const ethers = await getEthers();
    const wallet = new ethers.Wallet(Buffer.from(child.privateKey).toString('hex'));
    address = wallet.address; // EIP-55 checksummed 0x address
  } else if (network === 'tron') {
    // BIP-44 path for Tron (coin type 195)
    path = `m/44'/195'/0'/0/${index}`;
    const child = root.derive(path);
    if (!child.publicKey) throw new Error(`Failed to derive Tron key at ${path}`);
    address = pubKeyToTronAddress(child.publicKey);
  } else if (network === 'bitcoin') {
    // BIP-44 path for Bitcoin (coin type 0) — returns P2PKH address
    path = `m/44'/0'/0'/0/${index}`;
    const child = root.derive(path);
    if (!child.publicKey) throw new Error(`Failed to derive BTC key at ${path}`);
    // P2PKH: hash160(pubkey) → version byte 0x00 + checksum
    const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest();
    const ripemd160 = (b: Buffer) => crypto.createHash('ripemd160').update(b).digest();
    const pubKeyHash = ripemd160(sha256(Buffer.from(child.publicKey)));
    const payload = Buffer.concat([Buffer.from([0x00]), pubKeyHash]);
    const checksum = sha256(sha256(payload)).slice(0, 4);
    const bs58 = require('bs58');
    address = bs58.encode(Buffer.concat([payload, checksum]));
  } else {
    throw new Error(`Unsupported network for derivation: ${network}`);
  }

  return { address, network, coin: coin.toUpperCase(), derivationPath: path, index };
}

/**
 * Get (or deterministically assign) a derivation index for a customer+coin+network.
 * Reads from customer_crypto_wallets_v2; if not found, assigns the next available index.
 * Returns the derived wallet WITHOUT storing it — caller stores the address in DB.
 */
export async function getOrDeriveCustomerWallet(
  db: { query: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number }> },
  customerId: string,
  coin: string,
  network: 'tron' | 'evm' | 'bitcoin'
): Promise<DerivedWallet> {
  const coin_upper = coin.toUpperCase();

  // Check if customer already has a derived address for this coin/network
  const existing = await db.query(
    `SELECT address, derivation_index FROM customer_crypto_wallets_v2
     WHERE customer_id = ? AND coin = ? AND network = ?
     ORDER BY created_at ASC LIMIT 1`,
    [customerId, coin_upper, network]
  );

  if (existing.rows.length > 0 && existing.rows[0].address &&
      !existing.rows[0].address.includes('_placeholder')) {
    // Already has a real address — re-derive to confirm (address is deterministic)
    const idx = existing.rows[0].derivation_index ?? 0;
    return deriveWallet(network, idx, coin_upper);
  }

  // Assign next index: count distinct customers that already have a wallet for this network
  const countRes = await db.query(
    `SELECT COUNT(DISTINCT customer_id) as cnt FROM customer_crypto_wallets_v2
     WHERE network = ? AND derivation_index IS NOT NULL`,
    [network]
  );
  const nextIndex = Number(countRes.rows[0]?.cnt ?? 0);

  return deriveWallet(network, nextIndex, coin_upper);
}

/**
 * Derive the private key for a given network + index.
 * USE WITH EXTREME CAUTION — only call this immediately before signing; never log or store.
 */
export async function derivePrivateKey(
  network: 'tron' | 'evm' | 'bitcoin',
  index: number
): Promise<string> {
  const mnemonic = process.env.WALLET_MASTER_MNEMONIC?.trim();
  if (!mnemonic) throw new Error('WALLET_MASTER_MNEMONIC not set.');

  const bip39 = await getBip39();
  const { HDKey } = await getBip32();
  const wordlist = bip39.wordlists.english;
  if (!bip39.validateMnemonic(mnemonic, wordlist)) throw new Error('Invalid mnemonic.');

  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);

  const coinType = network === 'evm' ? "60'" : network === 'tron' ? "195'" : "0'";
  const path = `m/44'/${coinType}/0'/0/${index}`;
  const child = root.derive(path);
  if (!child.privateKey) throw new Error(`Key derivation failed at ${path}`);
  return Buffer.from(child.privateKey).toString('hex');
}

/**
 * Generate a fresh random mnemonic (utility — for initial setup only).
 * Print to stdout; NEVER log in production.
 */
export async function generateMnemonic(strength: 128 | 256 = 256): Promise<string> {
  const bip39 = await getBip39();
  return bip39.generateMnemonic(bip39.wordlists.english, strength);
}

/**
 * Map a coin+network string to the canonical derivation network type.
 */
export function toDerivationNetwork(coin: string, network: string): 'tron' | 'evm' | 'bitcoin' {
  const n = network.toLowerCase();
  const c = coin.toUpperCase();
  if (n === 'tron' || n === 'trc20' || n === 'trx') return 'tron';
  if (n === 'bsc' || n === 'bep20' || n === 'binance' || n === 'polygon' || n === 'matic' ||
      n === 'ethereum' || n === 'eth' || n === 'evm' || c === 'ETH' || c === 'BNB' || c === 'MATIC') return 'evm';
  if (n === 'bitcoin' || n === 'btc' || c === 'BTC') return 'bitcoin';
  // Default: if network is evm-like, treat as EVM
  return 'evm';
}
