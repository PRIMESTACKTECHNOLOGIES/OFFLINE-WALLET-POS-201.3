import { Router } from 'express';
import { bankTransferController } from './bank-transfer.controller';

const router = Router();

// ───────────────────────────────────────────────────────────────────────
// BANK TRANSFER ENDPOINTS
// Transak virtual account creation and management
// ───────────────────────────────────────────────────────────────────────

/**
 * POST /create-account
 * Create virtual account for bank transfer
 * Requires: x-merchant-id header
 * Body: { quoteId, userEmail? }
 */
router.post(
  '/create-account',
  bankTransferController.createAccount.bind(bankTransferController)
);

/**
 * GET /list
 * List bank transfer transactions (paginated)
 * Requires: x-merchant-id header
 * Query: limit=50, offset=0
 */
router.get(
  '/list',
  bankTransferController.listTransactions.bind(bankTransferController)
);

/**
 * GET /summary
 * Get bank transfer summary for merchant
 * Requires: x-merchant-id header
 */
router.get(
  '/summary',
  bankTransferController.getSummary.bind(bankTransferController)
);

/**
 * GET /:transactionId
 * Get bank transfer transaction details
 * Requires: x-merchant-id header
 */
router.get(
  '/:transactionId',
  bankTransferController.getTransaction.bind(bankTransferController)
);

/**
 * POST /:transactionId/status
 * Update transaction status (admin/system use)
 * Requires: x-merchant-id header
 * Body: { status, amount?, webhookData? }
 */
router.post(
  '/:transactionId/status',
  bankTransferController.updateStatus.bind(bankTransferController)
);

/**
 * POST /webhook
 * Transak webhook handler for payment notifications
 * No auth required (signature verified in service)
 */
router.post(
  '/webhook',
  bankTransferController.handleWebhook.bind(bankTransferController)
);

export { router as bankTransferRouter };
