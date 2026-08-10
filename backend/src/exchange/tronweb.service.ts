/**
 * TronWeb v6 Service — USDT TRC-20 direct blockchain withdrawals
 * No exchange needed. No Travel Rule. No KYC.
 *
 * .env keys needed:
 *   TRON_PRIVATE_KEY=your_hot_wallet_private_key
 *   TRON_WALLET_ADDRESS=your_hot_wallet_TRC20_address
 *   TRON_API_KEY=optional_trongrid_api_key
 */

import dotenv from 'dotenv';
dotenv.config();

// USDT TRC-20 contract on Tron mainnet
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

async function getTronWeb(): Promise<any> {
  const privateKey = process.env.TRON_PRIVATE_KEY?.trim();
  if (!privateKey) throw new Error('TRON_PRIVATE_KEY is not set in .env');

  // TronWeb v6 — named export
  const mod = require('tronweb/lib/commonjs/index.js');
  const TronWeb = mod.TronWeb || mod.default || mod;
  const apiKey = process.env.TRON_API_KEY?.trim();

  const tronWeb = new TronWeb({
    fullNode: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
    solidityNode: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
    eventServer: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
    privateKey,
    headers: apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {},
  });

  return tronWeb;
}

/** Address derived from private key */
export async function getHotWalletAddress(): Promise<string> {
  const explicit = process.env.TRON_WALLET_ADDRESS?.trim();
  if (explicit) return explicit;
  const tronWeb = await getTronWeb();
  return tronWeb.address.fromPrivateKey(process.env.TRON_PRIVATE_KEY!.trim());
}

/** USDT TRC-20 balance of hot wallet */
export async function getHotWalletUsdtBalance(): Promise<number> {
  const tronWeb = await getTronWeb();
  const address = await getHotWalletAddress();
  const contract = await tronWeb.contract().at(USDT_CONTRACT);
  const raw = await contract.balanceOf(address).call();
  return Number(raw) / 1_000_000;
}

/** TRX balance (needed for gas) */
export async function getHotWalletTrxBalance(): Promise<number> {
  const tronWeb = await getTronWeb();
  const address = await getHotWalletAddress();
  const bal = await tronWeb.trx.getBalance(address);
  return Number(bal) / 1_000_000;
}

/** Send USDT TRC-20 directly to any TRC-20 address */
export async function sendUsdt(toAddress: string, amount: number): Promise<{
  txId: string; amount: number; from: string; to: string; network: 'tron';
}> {
  if (!toAddress?.startsWith('T') || toAddress.length < 34) {
    throw new Error(`Invalid TRC-20 address: "${toAddress}". Must start with T, 34 chars.`);
  }
  if (amount <= 0) throw new Error('Amount must be > 0');

  const tronWeb = await getTronWeb();
  const from = await getHotWalletAddress();

  const usdtBal = await getHotWalletUsdtBalance();
  if (usdtBal < amount) {
    throw new Error(`Hot wallet has ${usdtBal.toFixed(2)} USDT, need ${amount} USDT. Fund the wallet first.`);
  }
  const trxBal = await getHotWalletTrxBalance();
  if (trxBal < 20) {
    throw new Error(`Hot wallet has ${trxBal.toFixed(2)} TRX. Need at least 20 TRX for gas. Fund the wallet.`);
  }

  const amountSun = Math.floor(amount * 1_000_000);
  const contract = await tronWeb.contract().at(USDT_CONTRACT);
  const txId = await contract.transfer(toAddress, amountSun).send({
    feeLimit: 100_000_000,
    callValue: 0,
    shouldPollResponse: false,
  });

  console.log(`[TronWeb] ✅ Sent ${amount} USDT → ${toAddress}  txId=${txId}`);
  return { txId: String(txId), amount, from, to: toAddress, network: 'tron' };
}

/** Generate a new Tron wallet (for customer deposit addresses) */
export function generateTronWallet(): { address: string; privateKey: string } {
  const mod = require('tronweb/lib/commonjs/index.js');
  const TronWeb = mod.TronWeb || mod.default || mod;
  const tronWeb = new TronWeb({ fullNode: 'https://api.trongrid.io', solidityNode: 'https://api.trongrid.io', eventServer: 'https://api.trongrid.io' });
  const acct = tronWeb.utils.accounts.generateAccount();
  return { address: acct.address.base58, privateKey: acct.privateKey };
}
