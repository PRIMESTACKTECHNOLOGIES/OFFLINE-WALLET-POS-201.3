import { Router } from 'express';
import { conflictResolutionController } from './conflict-resolution.controller';

const router = Router();

// ───────────────────────────────────────────────────────────────────────
// CONFLICT RESOLUTION ENDPOINTS
// ───────────────────────────────────────────────────────────────────────

/**
 * GET /detect-duplicates
 * Detect duplicate transactions for merchant
 * Requires: x-merchant-id header
 * Query: terminalId?, timeWindowMinutes?
 */
router.get(
  '/detect-duplicates',
  conflictResolutionController.detectDuplicates.bind(conflictResolutionController)
);

/**
 * POST /merge-duplicates
 * Merge a duplicate transaction group
 * Requires: x-merchant-id header
 * Body: { canonicalId, duplicateIds[], pan, amount, terminalId? }
 */
router.post(
  '/merge-duplicates',
  conflictResolutionController.mergeDuplicates.bind(conflictResolutionController)
);

/**
 * POST /reverse
 * Process a reversal/chargeback
 * Requires: x-merchant-id header
 * Body: { settlementId, reason, chargebackId? }
 */
router.post(
  '/reverse',
  conflictResolutionController.processReversal.bind(conflictResolutionController)
);

/**
 * POST /retry-sync
 * Retry a failed transaction sync
 * Requires: x-merchant-id header
 * Body: { transactionId, maxAttempts? }
 */
router.post(
  '/retry-sync',
  conflictResolutionController.retryFailedSync.bind(conflictResolutionController)
);

/**
 * POST /mark-sync-success/:syncRecordId
 * Mark a sync record as successful
 * Requires: x-merchant-id header
 */
router.post(
  '/mark-sync-success/:syncRecordId',
  conflictResolutionController.markSyncSuccess.bind(conflictResolutionController)
);

/**
 * POST /mark-sync-error/:syncRecordId
 * Mark a sync record with error
 * Requires: x-merchant-id header
 * Body: { error }
 */
router.post(
  '/mark-sync-error/:syncRecordId',
  conflictResolutionController.markSyncError.bind(conflictResolutionController)
);

/**
 * POST /run-resolution
 * Run complete conflict resolution process (detect duplicates, process reversals, retry syncs)
 * Requires: x-merchant-id header
 * Query: terminalId?
 */
router.post(
  '/run-resolution',
  conflictResolutionController.runConflictResolution.bind(conflictResolutionController)
);

/**
 * GET /history
 * Get conflict resolution history
 * Requires: x-merchant-id header
 * Query: limit=50, offset=0
 */
router.get(
  '/history',
  conflictResolutionController.getConflictHistory.bind(conflictResolutionController)
);

export { router as conflictResolutionRouter };
