import axios from "axios";
import { db } from "../../config/db";
import { v4 as uuidv4 } from "uuid";

async function getCryptoPrice(symbol: string): Promise<number> {
  const map: Record<string, string> = {
    BTC: "bitcoin",
    ETH: "ethereum",
    USDT: "tether",
  };
  const id = map[symbol.toUpperCase()];
  if (!id) return 1;

  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { timeout: 5000 }
    );
    return res.data?.[id]?.usd ?? 1;
  } catch {
    return 1;
  }
}

export async function buyCryptoWithMerchantWallet(
  merchantId: string,
  symbol: string,
  fiatAmount: number
) {
  const walletRes = await db.query(
    "SELECT * FROM merchant_wallets WHERE merchant_id = ?",
    [merchantId]
  );
  const wallet = walletRes.rows[0];
  if (!wallet) throw new Error("Merchant wallet not found");

  const balRes = await db.query(
    "SELECT balance FROM merchant_wallets WHERE id = ?",
    [wallet.id]
  );
  const balance = Number(balRes.rows[0]?.balance ?? 0);
  if (balance < fiatAmount) throw new Error("Insufficient merchant wallet balance");

  const rate = await getCryptoPrice(symbol);
  const cryptoAmount = fiatAmount / rate;

  const cryptoWalletRes = await db.query(
    "SELECT * FROM customer_crypto_wallets WHERE customer_id = ? AND crypto_coin = ?",
    [merchantId, symbol]
  );
  let cryptoWallet = cryptoWalletRes.rows[0];

  if (!cryptoWallet) {
    const id = uuidv4();
    await db.query(
      "INSERT INTO customer_crypto_wallets (id, customer_id, crypto_coin, balance) VALUES (?, ?, ?, 0)",
      [id, merchantId, symbol]
    );
    cryptoWallet = (await db.query("SELECT * FROM customer_crypto_wallets WHERE id = ?", [id]))
      .rows[0];
  }

  await db.query("BEGIN");

  try {
    await db.query(
      "UPDATE merchant_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [fiatAmount, wallet.id]
    );

    await db.query(
      `INSERT INTO merchant_wallet_transactions (id, wallet_id, type, amount, source, reference, description)
       VALUES (?, ?, 'debit', ?, 'crypto_purchase', ?, ?)`,
      [
        uuidv4(),
        wallet.id,
        fiatAmount,
        uuidv4(),
        `Bought ${cryptoAmount.toFixed(8)} ${symbol} @ $${rate}`,
      ]
    );

    await db.query(
      "UPDATE customer_crypto_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [cryptoAmount, cryptoWallet.id]
    );

    await db.query(
      `INSERT INTO crypto_transactions (id, customer_id, crypto_coin, transaction_type, fiat_amount, crypto_amount, fiat_currency, exchange_rate, source, provider_mode, status)
       VALUES (?, ?, ?, 'buy', ?, ?, 'USD', ?, 'merchant_wallet', 'primary', 'completed')`,
      [uuidv4(), merchantId, symbol, fiatAmount, cryptoAmount, rate]
    );

    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }

  return { success: true, cryptoAmount, rate, fiatAmount };
}
