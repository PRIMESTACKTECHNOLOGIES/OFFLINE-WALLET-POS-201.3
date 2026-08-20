import axios from "axios";
import { db } from "../../config/db";
import { v4 as uuidv4 } from "uuid";

// Get live crypto price (Coingecko)
async function getCryptoPrice(symbol: string): Promise<number> {
  const map: Record<string, string> = {
    BTC: "bitcoin",
    ETH: "ethereum",
    USDT: "tether",
    SOL: "solana"
  };

  const id = map[symbol.toUpperCase()];
  if (!id) throw new Error(`LIVE_PRICE_UNAVAILABLE: unsupported crypto asset ${symbol}`);

  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { timeout: 5000 }
    );
    const price = res.data?.[id]?.usd;
    if (!price || Number(price) <= 0) throw new Error(`LIVE_PRICE_UNAVAILABLE: ${symbol}`);
    return Number(price);
  } catch {
    throw new Error(`LIVE_PRICE_UNAVAILABLE: ${symbol}`);
  }
}

// Execute real BUY order on exchange
async function executeBuy(symbol: string, fiatAmount: number) {
  const url = process.env.EXCHANGE_BUY_URL;
  if (!url) throw new Error("Exchange BUY URL missing");

  const res = await axios.post(
    url,
    { symbol, fiatAmount },
    { timeout: 8000 }
  );

  if (!res.data?.success) {
    throw new Error(res.data?.message || "Exchange BUY failed");
  }

  return {
    cryptoAmount: res.data.cryptoAmount,
    executedFiat: res.data.executedFiat,
    fillRate: res.data.fillRate,
    orderId: res.data.orderId
  };
}

export async function offlineCryptoPurchase(
  merchantId: string,
  symbol: string,
  fiatAmount: number
) {
  if (!merchantId) throw new Error("merchantId required");
  if (fiatAmount <= 0) throw new Error("fiatAmount must be positive");

  // Get merchant wallet
  const walletRes = await db.query(
    "SELECT * FROM merchant_wallets WHERE merchant_id = ?",
    [merchantId]
  );
  const wallet = walletRes.rows[0];
  if (!wallet) throw new Error("Merchant wallet not found");

  // Check balance
  const balRes = await db.query(
    "SELECT balance FROM merchant_wallets WHERE id = ?",
    [wallet.id]
  );
  const balance = Number(balRes.rows[0]?.balance ?? 0);
  if (balance < fiatAmount) throw new Error("Insufficient merchant wallet balance");

  // Get live price before the exchange order.
  const liveRate = await getCryptoPrice(symbol);

  // Execute real BUY order
  const order = await executeBuy(symbol, fiatAmount);

  if (!order.cryptoAmount || !order.executedFiat || !order.fillRate || !order.orderId) {
    throw new Error('LIVE_EXCHANGE_RESULT_REQUIRED: incomplete provider response');
  }
  const cryptoAmount = Number(order.cryptoAmount);
  const executedFiat = Number(order.executedFiat);
  const fillRate = Number(order.fillRate);
  const orderId = String(order.orderId);

  // Get or create crypto wallet
  const cryptoRes = await db.query(
    "SELECT * FROM customer_crypto_wallets WHERE customer_id = ? AND crypto_coin = ?",
    [merchantId, symbol]
  );
  let cryptoWallet = cryptoRes.rows[0];

  if (!cryptoWallet) {
    const id = uuidv4();
    await db.query(
      "INSERT INTO customer_crypto_wallets (id, customer_id, crypto_coin, balance) VALUES (?, ?, ?, 0)",
      [id, merchantId, symbol]
    );
    cryptoWallet = (await db.query("SELECT * FROM customer_crypto_wallets WHERE id = ?", [id]))
      .rows[0];
  }

  // Atomic DB transaction
  await db.query("BEGIN");

  try {
    // Debit merchant wallet
    await db.query(
      "UPDATE merchant_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [executedFiat, wallet.id]
    );

    // Log merchant wallet transaction
    await db.query(
      `INSERT INTO merchant_wallet_transactions
       (id, wallet_id, type, amount, source, reference, description)
       VALUES (?, ?, 'debit', ?, 'crypto_purchase', ?, ?)`,
      [
        uuidv4(),
        wallet.id,
        executedFiat,
        orderId,
        `Bought ${cryptoAmount.toFixed(8)} ${symbol} @ $${fillRate}`
      ]
    );

    // Credit crypto wallet
    await db.query(
      "UPDATE customer_crypto_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [cryptoAmount, cryptoWallet.id]
    );

    // Log crypto transaction
    await db.query(
      `INSERT INTO crypto_transactions
       (id, customer_id, crypto_coin, transaction_type, fiat_amount, crypto_amount,
        fiat_currency, exchange_rate, source, provider_mode, status, reference)
       VALUES (?, ?, ?, 'buy', ?, ?, 'USD', ?, 'merchant_wallet', 'exchange', 'completed', ?)`,
      [
        uuidv4(),
        merchantId,
        symbol,
        executedFiat,
        cryptoAmount,
        fillRate,
        orderId
      ]
    );

    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }

  return {
    success: true,
    cryptoAmount,
    fiatSpent: executedFiat,
    rate: fillRate,
    orderId
  };
}
