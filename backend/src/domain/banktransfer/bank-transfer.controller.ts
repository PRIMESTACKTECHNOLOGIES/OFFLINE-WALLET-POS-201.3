import { Request, Response } from 'express';
import {
  createVirtualAccount,
  getBankTransferTransaction,
  updateTransactionStatus,
  listBankTransferTransactions,
  getBankTransferSummary,
  handleTransakWebhook,
  VirtualAccountRequest,
} from './bank-transfer.service';

export class BankTransferController {
  /**
   * Create virtual account
   * POST /create-account
   * Body: { quoteId, userEmail? }
   */
  async createAccount(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { quoteId, userEmail } = req.body;
      if (!quoteId) {
        return res.status(400).json({ error: 'Missing quoteId' });
      }

      // Get user IP from request
      const userIp =
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress ||
        '0.0.0.0';

      console.log(
        `[BankTransfer Controller] Creating virtual account: merchant=${merchantId}, quote=${quoteId}`
      );

      const request: VirtualAccountRequest = {
        quoteId,
        userIp,
        userEmail,
      };

      const transaction = await createVirtualAccount(merchantId, request);

      res.status(201).json({
        success: true,
        transaction,
      });
    } catch (e: any) {
      console.error('[BankTransfer Controller] Error creating account:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Get transaction details
   * GET /:transactionId
   */
  async getTransaction(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { transactionId } = req.params;

      console.log(
        `[BankTransfer Controller] Getting transaction: ${transactionId}`
      );

      const transaction = await getBankTransferTransaction(merchantId, transactionId);

      res.json({
        success: true,
        transaction,
      });
    } catch (e: any) {
      console.error('[BankTransfer Controller] Error getting transaction:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * List transactions
   * GET /list?limit=50&offset=0
   */
  async listTransactions(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      console.log(
        `[BankTransfer Controller] Listing transactions: merchant=${merchantId}, limit=${limit}, offset=${offset}`
      );

      const { transactions, total } = await listBankTransferTransactions(
        merchantId,
        limit,
        offset
      );

      res.json({
        success: true,
        transactions,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + limit < total,
        },
      });
    } catch (e: any) {
      console.error('[BankTransfer Controller] Error listing transactions:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Get summary
   * GET /summary
   */
  async getSummary(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      console.log(`[BankTransfer Controller] Getting summary: merchant=${merchantId}`);

      const summary = await getBankTransferSummary(merchantId);

      res.json({
        success: true,
        summary,
      });
    } catch (e: any) {
      console.error('[BankTransfer Controller] Error getting summary:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Update transaction status (admin/system use)
   * POST /:transactionId/status
   * Body: { status, amount?, webhookData? }
   */
  async updateStatus(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { transactionId } = req.params;
      const { status, amount, webhookData } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'Missing status' });
      }

      console.log(
        `[BankTransfer Controller] Updating status: ${transactionId} → ${status}`
      );

      await updateTransactionStatus(transactionId, status, amount, webhookData);

      res.json({
        success: true,
        message: `Transaction updated to ${status}`,
      });
    } catch (e: any) {
      console.error('[BankTransfer Controller] Error updating status:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Transak webhook handler (no auth required)
   * POST /webhook
   */
  async handleWebhook(req: Request, res: Response) {
    try {
      console.log('[BankTransfer Controller] Received webhook');

      const webhookData = req.body;

      await handleTransakWebhook(webhookData);

      res.json({
        success: true,
        message: 'Webhook processed',
      });
    } catch (e: any) {
      console.error('[BankTransfer Controller] Error handling webhook:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }
}

export const bankTransferController = new BankTransferController();
