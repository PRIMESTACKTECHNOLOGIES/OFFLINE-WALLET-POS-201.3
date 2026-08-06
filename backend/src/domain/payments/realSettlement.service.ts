import axios from "axios";
import { db } from "../../config/db";
import { v4 as uuidv4 } from "uuid";

export async function settleCardTransaction(
  merchantId: string,
  amount: number,
  authRef: string
) {
  if (!merchantId) throw new Error("merchantId required");
  if (amount <= 0) throw new Error("amount must be positive");
  if (!authRef) throw new Error("authRef required");

  // Processor capture endpoint
  const captureUrl = process.env.CARD_PROCESSOR_CAPTURE_URL;
  if (!captureUrl) throw new Error("CARD_PROCESSOR_CAPTURE_URL missing");

  // Call processor to capture funds
  const res = await axios.post(
    captureUrl,
    {
      amount,
      currency: "USD",
      authorizationReference: authRef
    },
    { timeout: 8000 }
  );

  if (!res.data?.success) {
    throw new Error(res.data?.message || "Processor capture failed");
  }

  const captureId = res.data.captureId || res.data.id || uuidv4();

  // Get or create merchant wallet
  const walletRes = await db.query(
    "SELECT * FROM merchant_wallets WHERE merchant_id = ?",
    [merchantId]
  );
  let wallet = walletRes.rows[0];

  if (!wallet) {
    const id = uuidv4();
    await db.query(
      `INSERT INTO merchant_wallets (id, merchant_id, balance, currency)
       VALUES (?, ?, 0, 'USD')`,
      [id, merchantId]
    );
    wallet = (await db.query("SELECT * FROM merchant_wallets WHERE id = ?", [id])).rows[0];
  }

  const txnId = uuidv4();

  // Credit merchant wallet with real settlement
  await db.query(
    "UPDATE merchant_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [amount, wallet.id]
  );

  // Log merchant wallet transaction
  await db.query(
    `INSERT INTO merchant_wallet_transactions
     (id, wallet_id, type, amount, source, reference, description)
     VALUES (?, ?, 'credit', ?, 'card_settlement', ?, ?)`,
    [
      txnId,
      wallet.id,
      amount,
      captureId,
      `Card settlement for auth ${authRef}`
    ]
  );

  // Store settlement record
  await db.query(
    `INSERT INTO settlements
     (id, merchant_id, amount, currency, processor_ref, status)
     VALUES (?, ?, ?, 'USD', ?, 'COMPLETED')`,
    [uuidv4(), merchantId, amount, captureId]
  );

  return {
    success: true,
    merchantWalletId: wallet.id,
    transactionId: txnId,
    captureId,
    settledAmount: amount
  };
}
