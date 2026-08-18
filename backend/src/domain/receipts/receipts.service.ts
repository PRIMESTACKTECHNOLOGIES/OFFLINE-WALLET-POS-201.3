import { db } from "../../config/db";
import { thermalReceiptService, ThermalTxnFull } from "./thermalReceipt.service";

export class ReceiptsService {
  /**
   * Generate a thermal receipt with full Protocol 101.1 details for a transaction
   */
  async generateReceipt(transactionId: string, merchantId: string) {
    try {
      const thermal = await thermalReceiptService.generateForTransaction(transactionId, merchantId);
      if (!thermal) throw new Error("Transaction not found");
      return thermal;
    } catch (error: any) {
      console.error("Error generating receipt:", error);
      throw error;
    }
  }

  /**
   * Get all receipts for a merchant (latest first)
   */
  async getReceipts(merchantId: string, limit: number = 50) {
    try {
      const result = await db.query(
        `SELECT
          r.receipt_id,
          r.transaction_id,
          r.generated_at,
          t.stan,
          t.amount_minor,
          t.currency,
          t.pan_masked,
          t.status,
          t.auth_code,
          t.txn_timestamp,
          b.batch_id,
          b.status AS batch_status
        FROM receipts r
        JOIN pos2013_transactions t ON r.transaction_id = t.id
        LEFT JOIN pos2013_batches b ON t.batch_id = b.batch_id
        WHERE r.merchant_id = ?
        ORDER BY r.generated_at DESC
        LIMIT ?`,
        [merchantId, limit]
      );

      return result.rows.map((row: any) => ({
        receiptId: row.receipt_id,
        transactionId: row.transaction_id,
        generatedAt: row.generated_at,
        stan: row.stan,
        authCode: row.auth_code,
        amount: (row.amount_minor / 100).toFixed(2),
        currency: row.currency || "USD",
        cardMasked: row.pan_masked,
        status: row.status,
        batchStatus: row.batch_status,
        batchId: row.batch_id,
        txnTimestamp: row.txn_timestamp
      }));
    } catch (error: any) {
      console.error("Error fetching receipts:", error);
      return [];
    }
  }

  /**
   * Get single thermal receipt by ID with full payload
   */
  async getReceiptById(receiptId: string, merchantId: string) {
    try {
      const row = await db.query(
        `SELECT receipt_data FROM receipts WHERE receipt_id = ? AND merchant_id = ? LIMIT 1`,
        [receiptId, merchantId]
      );
      if (!row.rows.length) return null;
      const payload = JSON.parse(row.rows[0].receipt_data);
      return payload;
    } catch (error: any) {
      console.error("Error fetching receipt:", error);
      return null;
    }
  }

  /**
   * Legacy print endpoint — always returns the 80mm thermal format (both copies)
   */
  async printReceipt(receiptId: string, merchantId: string) {
    const payload = await this.getReceiptById(receiptId, merchantId);
    if (!payload) {
      throw new Error("Receipt not found — generate it first via /receipts/generate/:transactionId");
    }
    return {
      receipt: payload,
      printable: payload.thermalCombined || payload.thermalCustomer || payload.thermalMerchant || "",
      plainTextCustomer: payload.plainCustomer || payload.thermalCustomer || "",
      plainTextMerchant: payload.plainMerchant || payload.thermalMerchant || "",
      thermalCustomer: payload.thermalCustomer || "",
      thermalMerchant: payload.thermalMerchant || "",
      thermalCombined: payload.thermalCombined || ""
    };
  }
}

export const receiptsService = new ReceiptsService();
