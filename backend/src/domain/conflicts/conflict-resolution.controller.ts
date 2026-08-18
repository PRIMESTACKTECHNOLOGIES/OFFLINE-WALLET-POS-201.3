import { Request, Response } from 'express';
import {
  detectDuplicates,
  mergeDuplicateGroup,
  processReversal,
  retryFailedSync,
  markSyncSuccess,
  markSyncError,
  runConflictResolution,
  getConflictHistory,
} from './conflict-resolution.service';

export class ConflictResolutionController {
  /**
   * Detect duplicate transactions
   * GET /detect-duplicates?terminalId=...
   */
  async detectDuplicates(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { terminalId, timeWindowMinutes } = req.query;

      const duplicates = await detectDuplicates(
        merchantId,
        terminalId as string,
        timeWindowMinutes ? Number(timeWindowMinutes) : 5
      );

      res.json({
        success: true,
        duplicateGroupsFound: duplicates.length,
        groups: duplicates,
      });
    } catch (e: any) {
      console.error('[Conflict Controller] Error detecting duplicates:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Merge a duplicate group
   * POST /merge-duplicates
   * Body: { canonicalId, duplicateIds, pan, amount, merchantId, terminalId }
   */
  async mergeDuplicates(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { canonicalId, duplicateIds, pan, amount, terminalId } = req.body || {};
      if (!canonicalId || !duplicateIds || !Array.isArray(duplicateIds) || !pan || !amount) {
        return res.status(400).json({
          error: 'canonicalId, duplicateIds (array), pan, and amount are required',
        });
      }

      console.log(
        `[Conflict Controller] Merging duplicates: canonical=${canonicalId}, duplicates=${duplicateIds.length}`
      );

      const success = await mergeDuplicateGroup({
        canonicalId,
        duplicateIds,
        pan,
        amount: Number(amount),
        merchantId,
        terminalId,
        transactionCount: duplicateIds.length + 1,
        mergedAt: new Date().toISOString(),
      });

      res.json({
        success,
        canonicalId,
        duplicatesMerged: duplicateIds.length,
        message: 'Duplicates merged successfully',
      });
    } catch (e: any) {
      console.error('[Conflict Controller] Error merging duplicates:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Process a reversal (chargeback)
   * POST /reverse
   * Body: { settlementId, reason, chargebackId? }
   */
  async processReversal(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { settlementId, reason, chargebackId } = req.body || {};
      if (!settlementId || !reason) {
        return res.status(400).json({ error: 'settlementId and reason are required' });
      }

      console.log(
        `[Conflict Controller] Processing reversal: settlement=${settlementId}, reason=${reason}`
      );

      const reversal = await processReversal(settlementId, reason, chargebackId);

      res.json({
        success: true,
        reversal,
      });
    } catch (e: any) {
      console.error('[Conflict Controller] Error processing reversal:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Retry a failed sync
   * POST /retry-sync
   * Body: { transactionId, maxAttempts? }
   */
  async retryFailedSync(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { transactionId, maxAttempts } = req.body || {};
      if (!transactionId) {
        return res.status(400).json({ error: 'transactionId is required' });
      }

      console.log(`[Conflict Controller] Retrying sync: txn=${transactionId}`);

      const syncRecord = await retryFailedSync(transactionId, merchantId, maxAttempts || 5);

      if (!syncRecord) {
        return res.status(400).json({
          success: false,
          error: 'Max retry attempts reached',
        });
      }

      res.json({
        success: true,
        syncRecord,
      });
    } catch (e: any) {
      console.error('[Conflict Controller] Error retrying sync:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Mark sync as successful
   * POST /mark-sync-success/:syncRecordId
   */
  async markSyncSuccess(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { syncRecordId } = req.params;
      if (!syncRecordId) {
        return res.status(400).json({ error: 'syncRecordId is required' });
      }

      console.log(`[Conflict Controller] Marking sync success: ${syncRecordId}`);

      await markSyncSuccess(syncRecordId);

      res.json({
        success: true,
        syncRecordId,
        message: 'Sync marked successful',
      });
    } catch (e: any) {
      console.error('[Conflict Controller] Error marking sync success:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Mark sync with error
   * POST /mark-sync-error/:syncRecordId
   * Body: { error }
   */
  async markSyncError(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { syncRecordId } = req.params;
      const { error } = req.body || {};
      if (!syncRecordId || !error) {
        return res.status(400).json({ error: 'syncRecordId and error are required' });
      }

      console.log(`[Conflict Controller] Marking sync error: ${syncRecordId} - ${error}`);

      await markSyncError(syncRecordId, error);

      res.json({
        success: true,
        syncRecordId,
        message: 'Sync error recorded',
      });
    } catch (e: any) {
      console.error('[Conflict Controller] Error marking sync error:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Run complete conflict resolution
   * POST /run-resolution?terminalId=...
   */
  async runConflictResolution(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { terminalId } = req.query;

      console.log(
        `[Conflict Controller] Running conflict resolution: merchant=${merchantId}, terminal=${terminalId}`
      );

      const result = await runConflictResolution(merchantId, terminalId as string);

      res.json(result);
    } catch (e: any) {
      console.error('[Conflict Controller] Error running conflict resolution:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Get conflict history
   * GET /history?limit=50&offset=0
   */
  async getConflictHistory(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      const history = await getConflictHistory(merchantId, limit, offset);

      res.json({
        success: true,
        ...history,
      });
    } catch (e: any) {
      console.error('[Conflict Controller] Error fetching conflict history:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }
}

export const conflictResolutionController = new ConflictResolutionController();
