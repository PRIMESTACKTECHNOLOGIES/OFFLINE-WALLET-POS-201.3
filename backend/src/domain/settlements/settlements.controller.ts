import { Request, Response } from "express";
import {
  settleReconciliationBatch,
  reverseSettlement,
  adjustSettlement,
  getMerchantSettlementSummary,
  getSettlementBatchDetails,
  listSettlementBatches,
  SettlementConfig,
} from "./settlement.service";

export class SettlementsController {
  /**
   * Settle a reconciliation batch
   * Credits merchant wallet for approved transactions
   * POST /settle
   * Body: { reconciliationReportId, config?: { baseFeePercent?, fixedFeeAmount?, holdDays? } }
   */
  async settleReconciliationBatch(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { reconciliationReportId, config } = req.body || {};
      if (!reconciliationReportId) {
        return res.status(400).json({ error: 'reconciliationReportId is required' });
      }

      console.log(
        `[Settlement Controller] Starting settlement: merchant=${merchantId}, report=${reconciliationReportId}`
      );

      const result = await settleReconciliationBatch(
        merchantId,
        reconciliationReportId,
        config as SettlementConfig
      );

      res.json({
        success: result.success,
        settlementBatchId: result.settlementBatchId,
        settledCount: result.settledCount,
        failedCount: result.failedCount,
        totalGrossAmount: result.totalGrossAmount,
        totalFeeAmount: result.totalFeeAmount,
        totalNetAmount: result.totalNetAmount,
        walletCreditId: result.walletCreditId,
        errors: result.errors,
      });
    } catch (e: any) {
      console.error('[Settlement Controller] Error settling batch:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Get merchant settlement summary
   * GET /summary?startDate=...&endDate=...
   */
  async getMerchantSummary(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { startDate, endDate } = req.query;

      const summary = await getMerchantSettlementSummary(
        merchantId,
        startDate as string,
        endDate as string
      );

      res.json({
        success: true,
        summary,
      });
    } catch (e: any) {
      console.error('[Settlement Controller] Error fetching summary:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Get settlement batch details
   * GET /batch/:batchId
   */
  async getBatchDetails(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { batchId } = req.params;
      if (!batchId) {
        return res.status(400).json({ error: 'batchId is required' });
      }

      const batch = await getSettlementBatchDetails(batchId);
      if (!batch) {
        return res.status(404).json({ error: 'Batch not found' });
      }

      // Verify merchant access
      if (batch.merchantId !== merchantId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      res.json({
        success: true,
        batch,
      });
    } catch (e: any) {
      console.error('[Settlement Controller] Error fetching batch:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * List settlement batches
   * GET /batches?limit=50&offset=0
   */
  async listBatches(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await listSettlementBatches(merchantId, limit, offset);

      res.json({
        success: true,
        ...result,
      });
    } catch (e: any) {
      console.error('[Settlement Controller] Error listing batches:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Reverse a settlement (for refunds/chargebacks)
   * POST /reverse
   * Body: { settlementId, reason }
   */
  async reverseSettlement(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { settlementId, reason } = req.body || {};
      if (!settlementId || !reason) {
        return res.status(400).json({ error: 'settlementId and reason are required' });
      }

      console.log(`[Settlement Controller] Reversing settlement ${settlementId}: ${reason}`);

      await reverseSettlement(settlementId, reason);

      res.json({
        success: true,
        settlementId,
        message: 'Settlement reversed successfully',
      });
    } catch (e: any) {
      console.error('[Settlement Controller] Error reversing settlement:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Adjust a settlement amount (partial refunds/corrections)
   * POST /adjust
   * Body: { settlementId, adjustmentAmount, reason }
   */
  async adjustSettlement(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { settlementId, adjustmentAmount, reason } = req.body || {};
      if (!settlementId || adjustmentAmount === undefined || !reason) {
        return res.status(400).json({
          error: 'settlementId, adjustmentAmount, and reason are required',
        });
      }

      const amount = Number(adjustmentAmount);
      if (isNaN(amount)) {
        return res.status(400).json({ error: 'adjustmentAmount must be a valid number' });
      }

      console.log(
        `[Settlement Controller] Adjusting settlement ${settlementId} by $${amount}: ${reason}`
      );

      await adjustSettlement(settlementId, amount, reason);

      res.json({
        success: true,
        settlementId,
        adjustmentAmount: amount,
        message: 'Settlement adjusted successfully',
      });
    } catch (e: any) {
      console.error('[Settlement Controller] Error adjusting settlement:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }
}

export const settlementsController = new SettlementsController();
