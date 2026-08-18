import { Router } from 'express';
import { dashboardController } from './dashboard.controller';

const router = Router();

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
