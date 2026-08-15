/**
 * Polygon (MATIC) ERC-20 Direct Blockchain Service
 * 0 KYC, 0 exchange involvement — self-custody wallets (HOT = gas only, TREASURY = USDT).
 *
 * .env keys needed:
 *   POLYGON_PRIVATE_KEY=0x_your_hot_wallet_private_key            → HOT (gas only)
 *   POLYGON_WALLET_ADDRESS=0x_your_hot_wallet_address             → HOT (gas only)
 *   POLYGON_TREASURY_PRIVATE_KEY=0x_your_treasury_private_key     → TREASURY (holds real USDT)
 *   POLYGON_TREASURY_ADDRESS=0x_your_treasury_address             → TREASURY (holds real USDT)
 *   POLYGON_RPC_URL=https://polygon-rpc.com  (optional — default public RPC)
 *
 * WALLET SEGREGATION (per operator directive — NO USDT on HOT):
 *  • HOT      → holds only MATIC (native gas). Never USDT.
 *  • TREASURY → holds real USDT for outbound settlement.
 */

import dotenv from 'dotenv';
dotenv.config();

const USDT_POLYGON_CONTRACT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const DEFAULT_RPC = 'https://polygon-rpc.com';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint amount) returns (bool)',
];

let ethersCache: any = null;

async function getEthers() {
  if (ethersCache) return ethersCache;
  ethersCache = await import('ethers');
  return ethersCache;
}

export function isConfigured(): boolean {
  const pk = process.env.POLYGON_PRIVATE_KEY?.trim();
  return !!pk && !pk.includes('your_') && !pk.includes('REPLACE');
}

async function getProvider() {
  const ethers = await getEthers();
  const rpc = process.env.POLYGON_RPC_URL?.trim() || DEFAULT_RPC;
  return new ethers.JsonRpcProvider(rpc, {
    name: 'polygon',
    chainId: 137,
  });
}

async function getWallet() {
  const ethers = await getEthers();
  const pk = process.env.POLYGON_PRIVATE_KEY?.trim();
  if (!pk) throw new Error('POLYGON_PRIVATE_KEY is not set in .env');
  const provider = await getProvider();
  return new ethers.Wallet(pk, provider);
}

export async function getHotWalletAddress(): Promise<string> {
  const explicit = process.env.POLYGON_WALLET_ADDRESS?.trim();
  if (explicit) return explicit;
  const w = await getWallet();
  return w.address;
}

export async function getHotWalletUsdtBalance(): Promise<number> {
  const ethers = await getEthers();
  const address = await getHotWalletAddress();
  const provider = await getProvider();
  const contract = new ethers.Contract(USDT_POLYGON_CONTRACT, ERC20_ABI, provider);
  const decimals = Number(await contract.decimals());
  const raw = await contract.balanceOf(address);
  return Number(raw) / (10 ** decimals);
}

export async function getHotWalletMaticBalance(): Promise<number> {
  const ethers = await getEthers();
  const address = await getHotWalletAddress();
  const provider = await getProvider();
  const bal = await provider.getBalance(address);
  return Number(ethers.formatEther(bal));
}

// ── Treasury wallet (holds real USDT; hot = gas ONLY) ──

export function isTreasuryConfigured(): boolean {
  return !!(process.env.POLYGON_TREASURY_PRIVATE_KEY?.trim()?.replace(/^0x/, '')
    && process.env.POLYGON_TREASURY_ADDRESS?.trim());
}

async function getTreasuryWallet() {
  const ethers = await getEthers();
  const pk = process.env.POLYGON_TREASURY_PRIVATE_KEY?.trim();
  if (!pk) throw new Error('POLYGON_TREASURY_PRIVATE_KEY not set in .env');
  const provider = await getProvider();
  return new ethers.Wallet(pk, provider);
}

export async function getTreasuryAddress(): Promise<string> {
  const explicit = process.env.POLYGON_TREASURY_ADDRESS?.trim();
  if (explicit) return explicit;
  const w = await getTreasuryWallet();
  return w.address;
}

export async function getTreasuryUsdtBalance(): Promise<number> {
  if (!isTreasuryConfigured()) return 0;
  const ethers = await getEthers();
  const address = await getTreasuryAddress();
  const provider = await getProvider();
  const contract = new ethers.Contract(USDT_POLYGON_CONTRACT, ERC20_ABI, provider);
  const decimals = Number(await contract.decimals());
  const raw = await contract.balanceOf(address);
  return Number(raw) / (10 ** decimals);
}

export async function getTreasuryMaticBalance(): Promise<number> {
  if (!isTreasuryConfigured()) return 0;
  const ethers = await getEthers();
  const address = await getTreasuryAddress();
  const provider = await getProvider();
  const bal = await provider.getBalance(address);
  return Number(ethers.formatEther(bal));
}

export async function sendUsdt(toAddress: string, amount: number, opts?: {
  useTreasury?: boolean | 'auto';
}): Promise<{
  txId?: string;
  amount: number;
  from: string;
  to: string;
  network: 'polygon';
  deferred?: boolean;
  status?: 'broadcast' | 'deferred';
  note?: string;
  hotWalletUsdtBalance?: number;
  hotWalletNativeBalance?: number;
  treasuryUsdtBalance?: number;
  treasuryNativeBalance?: number;
  senderRole?: 'hot' | 'treasury';
}> {
  // ARCHITECTURAL NOTE (per operator directive):
  //  • USDT shortfall → return deferred (auto-retryable, NOT an error)
  //  • Only MATIC (native gas) throws hard → pending_manual (human tops up)
  if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress || '')) {
    throw new Error(`Invalid Polygon ERC-20 address: "${toAddress}". Must be 0x + 40 hex chars.`);
  }
  if (amount <= 0) throw new Error('Amount must be > 0');
  const ethers = await getEthers();
  const useTreasury = opts?.useTreasury ?? 'auto';
  const treasuryConfigured = isTreasuryConfigured();

  let senderRole: 'hot' | 'treasury';
  if (useTreasury === true) senderRole = 'treasury';
  else if (useTreasury === false) senderRole = 'hot';
  else {
    const tBal = treasuryConfigured ? await getTreasuryUsdtBalance() : 0;
    senderRole = (treasuryConfigured && tBal >= amount) ? 'treasury' : 'hot';
  }
  if (senderRole === 'treasury' && !treasuryConfigured) {
    throw new Error('Polygon treasury not configured. Set POLYGON_TREASURY_PRIVATE_KEY + POLYGON_TREASURY_ADDRESS in .env.');
  }

  const wallet = senderRole === 'treasury' ? await getTreasuryWallet() : await getWallet();
  const from = wallet.address;
  const usdtBal = senderRole === 'treasury' ? await getTreasuryUsdtBalance() : await getHotWalletUsdtBalance();
  const maticBal = senderRole === 'treasury' ? await getTreasuryMaticBalance() : await getHotWalletMaticBalance();

  if (maticBal < 0.5) {
    throw new Error(`Polygon ${senderRole === 'treasury' ? 'treasury' : 'hot'} wallet has ${maticBal.toFixed(5)} MATIC for gas. Need at least 0.5 MATIC. Fund: ${from}`);
  }

  if (usdtBal < amount) {
    return {
      amount,
      from,
      to: toAddress,
      network: 'polygon',
      deferred: true,
      status: 'deferred',
      note:
        `On-chain USDT broadcast deferred — Polygon ${senderRole === 'treasury' ? 'treasury' : 'hot'} wallet has ${usdtBal.toFixed(2)} USDT, needs ${amount}. ` +
        `Wallet ${from} will deliver ${amount} USDT to ${toAddress} once USDT balance is sufficient. ` +
        `Gas (MATIC) will be paid from ${senderRole} wallet native reserve. ` +
        `Internal ledger entry is FINAL — no rollback, no refund required.` +
        (senderRole === 'hot' && treasuryConfigured ? ` (Tip: Treasury exists — try the treasury sender path.)` : ''),
      hotWalletUsdtBalance: senderRole === 'hot' ? usdtBal : undefined,
      hotWalletNativeBalance: senderRole === 'hot' ? maticBal : undefined,
      treasuryUsdtBalance: senderRole === 'treasury' ? usdtBal : undefined,
      treasuryNativeBalance: senderRole === 'treasury' ? maticBal : undefined,
      senderRole,
    };
  }

  const contract = new ethers.Contract(USDT_POLYGON_CONTRACT, ERC20_ABI, wallet);
  const decimals = Number(await contract.decimals());
  const amountWei = ethers.parseUnits(String(amount), decimals);
  const tx = await contract.transfer(toAddress, amountWei, {
    gasLimit: 100_000,
  });
  console.log(`[Polygon] ✅ [${senderRole.toUpperCase()}] Sent ${amount} USDT (ERC-20) → ${toAddress}  txHash=${tx.hash}  from=${from}`);
  return {
    txId: String(tx.hash),
    amount,
    from,
    to: toAddress,
    network: 'polygon',
    deferred: false,
    status: 'broadcast',
    hotWalletUsdtBalance: senderRole === 'hot' ? usdtBal : undefined,
    hotWalletNativeBalance: senderRole === 'hot' ? maticBal : undefined,
    treasuryUsdtBalance: senderRole === 'treasury' ? usdtBal : undefined,
    treasuryNativeBalance: senderRole === 'treasury' ? maticBal : undefined,
    senderRole,
  };
}
