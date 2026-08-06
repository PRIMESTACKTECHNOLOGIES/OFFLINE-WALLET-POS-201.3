import { db } from "../../config/db";
import { v4 as uuidv4 } from "uuid";

export async function creditMerchantFromOfflinePos(
  merchantId: string,
  amount: number,
  posRef: string
) {
  const res = await db.query(
    "SELECT * FROM merchant_wallets WHERE merchant_id = ?",
    [merchantId]
  );
  let wallet = res.rows[0];

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

  await db.query(
    `UPDATE merchant_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [amount, wallet.id]
  );

  await db.query(
    `INSERT INTO merchant_wallet_transactions (id, wallet_id, type, amount, source, reference, description)
     VALUES (?, ?, 'credit', ?, 'offline_pos', ?, ?)`,
    [txnId, wallet.id, amount, posRef, `Offline POS sale ${posRef}`]
  );

  return { success: true, walletId: wallet.id, transactionId: txnId };
}
