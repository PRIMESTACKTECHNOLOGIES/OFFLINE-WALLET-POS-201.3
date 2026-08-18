import { Router } from 'express';
import { auditTrailController } from './audit-trail.controller';

const router = Router();

// ───────────────────────────────────────────────────────────────────────
// AUDIT TRAIL ENDPOINTS
// ───────────────────────────────────────────────────────────────────────

/**
 * GET /transaction/:transactionId
 * Get complete transaction lifecycle audit trail
 * Requires: x-merchant-id header
 */
router.get(
  '/transaction/:transactionId',
  auditTrailController.getTransactionTrail.bind(auditTrailController)
);

/**
 * GET /query
 * Query audit trail with filters
 * Requires: x-merchant-id header
 * Query: transactionId?, eventType?, eventCategory?, actor?, dateFrom?, dateTo?, limit=50, offset=0
 */
router.get(
  '/query',
  auditTrailController.queryTrail.bind(auditTrailController)
);

/**
 * POST /compliance-report
 * Generate compliance report for period
 * Requires: x-merchant-id header
 * Body: { dateFrom, dateTo }
 */
router.post(
  '/compliance-report',
  auditTrailController.generateReport.bind(auditTrailController)
);

/**
 * GET /compliance-report/:reportId
 * Get compliance report details
 * Requires: x-merchant-id header
 */
router.get(
  '/compliance-report/:reportId',
  auditTrailController.getReport.bind(auditTrailController)
);

export { router as auditTrailRouter };
