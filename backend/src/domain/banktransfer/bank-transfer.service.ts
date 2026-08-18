import { db } from '../../config/db';
import crypto from 'crypto';
import axios from 'axios';

// ───────────────────────────────────────────────────────────────────────
// BANK TRANSFER SERVICE
// Transak virtual account creation and management for bank transfer payments
// ───────────────────────────────────────────────────────────────────────

export interface VirtualAccountRequest {
  quoteId: string;
  userIp: string;
  userEmail?: string;
  accessToken?: string;
}

export interface VirtualAccountResponse {
  status: 'INITIATED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  message: string;
  accountDetails?: {
    accountNumber?: string;
    bankName?: string;
    routingNumber?: string;
    accountHolderName?: string;
    referenceNumber?: string;
  };
  createdAt?: string;
}

export interface BankTransferTransaction {
  id: string;
  merchantId: string;
  quoteId: string;
  virtualAccountId: string;
  amount: number;
  currency: string;
  status: 'INITIATED' | 'PENDING' | 'RECEIVED' | 'COMPLETED' | 'FAILED';
  userEmail?: string;
  userIp: string;
  accountDetails?: any;
  webhook?: any;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get Transak API endpoint and key from environment
 */
function getTransakConfig() {
  const mode = process.env.TRANSAK_MODE || 'staging';
  const isProduction = mode === 'production';
  
  const endpoint = isProduction
    ? 'https://api.transak.com'
    : 'https://api-gateway-stg.transak.com';
  
  const apiKey = isProduction
    ? process.env.TRANSAK_API_KEY_PROD
    : process.env.TRANSAK_API_KEY_STG;
  
  if (!apiKey) {
    throw new Error(`Missing Transak API key for ${mode} mode`);
  }
  
  return { endpoint, apiKey, mode };
}

/**
 * Create virtual account for bank transfer
 * Calls Transak Create Virtual Account API
 */
export async function createVirtualAccount(
  merchantId: string,
  request: VirtualAccountRequest
): Promise<BankTransferTransaction> {
  try {
    const { endpoint, apiKey } = getTransakConfig();
    const id = crypto.randomUUID();

    console.log(
      `[BankTransfer] Creating virtual account: merchant=${merchantId}, quote=${request.quoteId}`
    );

    // Call Transak API
    const response = await axios.post(
      `${endpoint}/api/v2/onramp/virtual-account`,
      { quoteId: request.quoteId },
      {
        headers: {
          'x-api-key': apiKey,
          'x-user-ip': request.userIp,
          ...(request.userEmail && { 'x-user-identifier': request.userEmail }),
          ...(request.accessToken && { 'x-access-token': request.accessToken }),
          'Content-Type': 'application/json',
        },
      }
    );

    const transaktResponse = response.data;

    console.log(
      `[BankTransfer] Virtual account creation response: status=${transaktResponse.data?.status}`
    );

    // Store transaction record
    const query = `
      INSERT INTO bank_transfer_transactions
        (id, merchant_id, quote_id, virtual_account_id, amount, currency, status, user_email, user_ip, account_details, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();
    const virtualAccountId = crypto.randomUUID();

    await db.query(query, [
      id,
      merchantId,
      request.quoteId,
      virtualAccountId,
      0, // Amount will be set when payment received
      'USD', // Default, will be from quote
      transaktResponse.data?.status || 'INITIATED',
      request.userEmail || null,
      request.userIp,
      JSON.stringify(transaktResponse.data?.accountDetails || {}),
      now,
      now,
    ]);

    const transaction: BankTransferTransaction = {
      id,
      merchantId,
      quoteId: request.quoteId,
      virtualAccountId,
      amount: 0,
      currency: 'USD',
      status: transaktResponse.data?.status || 'INITIATED',
      userEmail: request.userEmail,
      userIp: request.userIp,
      accountDetails: transaktResponse.data?.accountDetails,
      createdAt: now,
      updatedAt: now,
    };

    console.log(
      `[BankTransfer] Virtual account created successfully: ${id}`
    );

    return transaction;
  } catch (e: any) {
    console.error('[BankTransfer] Error creating virtual account:', e);

    if (e.response?.status === 401) {
      throw new Error('Unauthorized: Invalid Transak API key');
    }
    if (e.response?.status === 400) {
      throw new Error(`Bad request: ${e.response.data?.message || 'Invalid parameters'}`);
    }

    throw e;
  }
}

/**
 * Get bank transfer transaction details
 */
export async function getBankTransferTransaction(
  merchantId: string,
  transactionId: string
): Promise<BankTransferTransaction> {
  try {
    const query = `
      SELECT * FROM bank_transfer_transactions
      WHERE id = ? AND merchant_id = ?
    `;

    const result = await db.query(query, [transactionId, merchantId]);

    if (!result.rows || result.rows.length === 0) {
      throw new Error(`Bank transfer transaction not found: ${transactionId}`);
    }

    const row = result.rows[0] as any;

    const transaction: BankTransferTransaction = {
      id: row.id,
      merchantId: row.merchant_id,
      quoteId: row.quote_id,
      virtualAccountId: row.virtual_account_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      userEmail: row.user_email,
      userIp: row.user_ip,
      accountDetails: row.account_details ? JSON.parse(row.account_details) : undefined,
      webhook: row.webhook_data ? JSON.parse(row.webhook_data) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return transaction;
  } catch (e: any) {
    console.error('[BankTransfer] Error getting transaction:', e);
    throw e;
  }
}

/**
 * Update transaction status when payment received
 */
export async function updateTransactionStatus(
  transactionId: string,
  status: 'PENDING' | 'RECEIVED' | 'COMPLETED' | 'FAILED',
  amount?: number,
  webhookData?: any
): Promise<void> {
  try {
    let query = `
      UPDATE bank_transfer_transactions
      SET status = ?, updated_at = ?
    `;

    const params: any[] = [status, new Date().toISOString()];

    if (amount !== undefined) {
      query += `, amount = ?`;
      params.push(amount);
    }

    if (webhookData) {
      query += `, webhook_data = ?`;
      params.push(JSON.stringify(webhookData));
    }

    query += ` WHERE id = ?`;
    params.push(transactionId);

    await db.query(query, params);

    console.log(`[BankTransfer] Transaction status updated: ${transactionId} → ${status}`);
  } catch (e: any) {
    console.error('[BankTransfer] Error updating transaction status:', e);
    throw e;
  }
}

/**
 * List bank transfer transactions for merchant
 */
export async function listBankTransferTransactions(
  merchantId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ transactions: BankTransferTransaction[]; total: number }> {
  try {
    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM bank_transfer_transactions WHERE merchant_id = ?`,
      [merchantId]
    );

    const total = Number((countResult.rows?.[0] as any)?.count || 0);

    // Get paginated results
    const query = `
      SELECT * FROM bank_transfer_transactions
      WHERE merchant_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const result = await db.query(query, [merchantId, limit, offset]);

    const transactions: BankTransferTransaction[] = (result.rows || []).map((row: any) => ({
      id: row.id,
      merchantId: row.merchant_id,
      quoteId: row.quote_id,
      virtualAccountId: row.virtual_account_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      userEmail: row.user_email,
      userIp: row.user_ip,
      accountDetails: row.account_details ? JSON.parse(row.account_details) : undefined,
      webhook: row.webhook_data ? JSON.parse(row.webhook_data) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    console.log(
      `[BankTransfer] Listed transactions: merchant=${merchantId}, count=${transactions.length}, total=${total}`
    );

    return { transactions, total };
  } catch (e: any) {
    console.error('[BankTransfer] Error listing transactions:', e);
    throw e;
  }
}

/**
 * Get transaction summary for merchant
 */
export async function getBankTransferSummary(merchantId: string): Promise<any> {
  try {
    const query = `
      SELECT
        status,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount,
        MIN(created_at) as earliest,
        MAX(created_at) as latest
      FROM bank_transfer_transactions
      WHERE merchant_id = ?
      GROUP BY status
    `;

    const result = await db.query(query, [merchantId]);

    const summary: any = {
      total: 0,
      byStatus: {},
      totalAmount: 0,
    };

    (result.rows || []).forEach((row: any) => {
      const status = row.status;
      const count = Number(row.count);
      const amount = Number(row.total_amount);

      summary.byStatus[status] = {
        count,
        totalAmount: amount,
      };

      summary.total += count;
      summary.totalAmount += amount;
    });

    console.log(
      `[BankTransfer] Summary for ${merchantId}: ${summary.total} transactions, $${summary.totalAmount}`
    );

    return summary;
  } catch (e: any) {
    console.error('[BankTransfer] Error getting summary:', e);
    throw e;
  }
}

/**
 * Handle Transak webhook for payment received
 */
export async function handleTransakWebhook(webhookData: any): Promise<void> {
  try {
    console.log('[BankTransfer] Received Transak webhook:', webhookData);

    // Verify webhook signature if provided
    const signature = webhookData.signature;
    if (signature) {
      const { apiKey } = getTransakConfig();
      // Webhook verification logic here
      console.log('[BankTransfer] Webhook signature verification skipped (implement as needed)');
    }

    // Find transaction by virtual account ID or quote ID
    const transactionId = webhookData.virtualAccountId || webhookData.quoteId;
    if (!transactionId) {
      console.warn('[BankTransfer] Webhook missing identification: virtualAccountId or quoteId');
      return;
    }

    // Update transaction with payment details
    const amount = webhookData.amount || 0;
    const status = webhookData.status === 'COMPLETED' ? 'COMPLETED' : 'RECEIVED';

    const query = `
      UPDATE bank_transfer_transactions
      SET status = ?, amount = ?, webhook_data = ?, updated_at = ?
      WHERE virtual_account_id = ? OR quote_id = ?
    `;

    await db.query(query, [
      status,
      amount,
      JSON.stringify(webhookData),
      new Date().toISOString(),
      transactionId,
      transactionId,
    ]);

    console.log(`[BankTransfer] Webhook processed: amount=${amount}, status=${status}`);
  } catch (e: any) {
    console.error('[BankTransfer] Error handling webhook:', e);
    throw e;
  }
}
