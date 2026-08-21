import { Router } from 'express';
import { dashboardController } from './dashboard.controller';

const router = Router();

/**
 * GET /unprocessed
 * Returns count + total USD of all unprocessed POS transactions
 * (transactions that were never batch-processed into a merchant wallet)
 */
router.get('/unprocessed', dashboardController.getUnprocessed.bind(dashboardController));

/**
 * POST /process-batch
 * Process all unprocessed transactions → credit merchant wallet + USDT balance
 * Body: { merchantId: string }
 */
router.post('/process-batch', dashboardController.processBatch.bind(dashboardController));

// ───────────────────────────────────────────────────────────────────────
// STATUS DASHBOARD ENDPOINTS
// Real-time visualization of offline settlement status
// ───────────────────────────────────────────────────────────────────────

/**
 * GET /data
 * Get complete dashboard data with all metrics, pending transactions, recent settlements
 * Requires: x-merchant-id header
 * Query: terminalId?
 */
router.get(
  '/data',
  dashboardController.getDashboard.bind(dashboardController)
);

/**
 * GET /summary
 * Get dashboard summary metrics only (lighter endpoint for frequent polling)
 * Requires: x-merchant-id header
 * Query: terminalId?
 */
router.get(
  '/summary',
  dashboardController.getSummary.bind(dashboardController)
);

/**
 * GET /pending
 * Get pending (unsettled) transactions
 * Requires: x-merchant-id header
 * Query: terminalId?, limit=100
 */
router.get(
  '/pending',
  dashboardController.getPending.bind(dashboardController)
);

/**
 * GET /settlements
 * Get recent settlements (paginated, time-windowed)
 * Requires: x-merchant-id header
 * Query: terminalId?, limit=50, hoursBack=24
 */
router.get(
  '/settlements',
  dashboardController.getSettlements.bind(dashboardController)
);

export { router as dashboardRouter };
