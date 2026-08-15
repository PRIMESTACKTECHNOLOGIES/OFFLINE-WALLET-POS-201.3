import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/db";

export async function settleCardTransactionToMerchant(
  merchantId: string,
  amount: number,
  cardRef: string,
  currency: string = 'USD'
) {
  const ccy = String(currency || 'USD').toUpperCase().trim();
  const processorUrl = process.env.CARD_PROCESSOR_CAPTURE_URL;
  if (!processorUrl) throw new Error("Processor capture URL missing");

  const res = await axios.post(
    processorUrl,
    {
      amount,
      currency: ccy,
      reference: cardRef,
    },
    { timeout: 8000 }
  );

  if (!res.data?.success) {
    throw new Error(res.data?.message || "Processor settlement failed");
  }

  const captureId = res.data.captureId || res.data.id || uuidv4();

  const walletRes = await db.query(
    "SELECT * FROM merchant_wallets WHERE merchant_id = ? AND currency = ?",
    [merchantId, ccy]
  );
  let wallet = walletRes.rows[0];

  if (!wallet) {
    const id = uuidv4();
    await db.query(
      `INSERT INTO merchant_wallets (id, merchant_id, balance, currency)
       VALUES (?, ?, 0, ?)`,
      [id, merchantId, ccy]
    );
    wallet = (await db.query("SELECT * FROM merchant_wallets WHERE id = ?", [id])).rows[0];
  }

  const txnId = uuidv4();

  await db.query(
    "UPDATE merchant_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [amount, wallet.id]
  );

  await db.query(
    `INSERT INTO merchant_wallet_transactions (id, wallet_id, type, amount, currency, source, reference, description)
     VALUES (?, ?, 'credit', ?, ?, 'card_settlement', ?, ?)`,
    [txnId, wallet.id, amount, ccy, captureId, `Card settlement ${cardRef}`]
  );

  await db.query(
    `INSERT INTO settlements (id, merchant_id, amount, currency, processor_ref, status)
     VALUES (?, ?, ?, ?, ?, 'COMPLETED')`,
    [uuidv4(), merchantId, amount, ccy, captureId]
  );

  return { success: true, transactionId: txnId, captureId, currency: ccy };
}
