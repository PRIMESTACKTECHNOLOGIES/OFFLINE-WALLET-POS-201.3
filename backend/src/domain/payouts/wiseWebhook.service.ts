import crypto from "crypto";
import { db } from "../../config/db";

export function verifyWiseWebhook(rawBody: Buffer | string, signatureHeader?: string) {
  const secret = process.env.WISE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return true;
  }

  if (!signatureHeader) {
    throw new Error("Missing Wise webhook signature header");
  }

  const payload = rawBody instanceof Buffer ? rawBody : Buffer.from(String(rawBody), "utf8");
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const provided = signatureHeader.trim();

  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

export async function handleWiseWebhook(event: any) {
  if (!event || !event.type || !event.data) {
    throw new Error("Invalid webhook payload");
  }

  const providerRef = event.data?.id || event.data?.transferId || event.data?.transfer_id;
  if (!providerRef) {
    throw new Error("Missing provider reference");
  }

  const payoutRes = await db.query(
    "SELECT * FROM bank_payouts WHERE provider_ref = ?",
    [providerRef]
  );
  const payout = payoutRes.rows[0];

  if (!payout) {
    throw new Error("Payout not found");
  }

  const payoutId = payout.id;
  const customerId = payout.customer_id;
  const amount = Number(payout.amount ?? 0);

  switch (event.type) {
    case "transfer.funds_received":
      await db.query(
        "UPDATE bank_payouts SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [payoutId]
      );
      return { success: true, status: "PROCESSING" };

    case "transfer.completed":
      await db.query(
        "UPDATE bank_payouts SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [payoutId]
      );
      return { success: true, status: "COMPLETED" };

    case "transfer.failed":
    case "transfer.cancelled":
      await db.query("BEGIN");
      try {
        await db.query(
          "UPDATE customer_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?",
          [amount, customerId]
        );

        await db.query(
          `INSERT INTO wallet_transactions
           (id, wallet_id, type, amount, source, reference, description)
           VALUES (?, (SELECT id FROM customer_wallets WHERE customer_id = ?),
           'credit', ?, 'bank_payout_refund', ?, ?)`,
          [
            crypto.randomUUID(),
            customerId,
            amount,
            payout.reference,
            `Refund for failed payout ${payout.reference}`,
          ]
        );

        await db.query(
          "UPDATE bank_payouts SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [payoutId]
        );

        await db.query("COMMIT");
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }

      return { success: true, status: "FAILED", refunded: amount };

    default:
      return { success: true, status: "IGNORED" };
  }
}
