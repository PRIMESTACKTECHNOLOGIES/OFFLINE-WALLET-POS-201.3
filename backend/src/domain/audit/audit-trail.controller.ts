import { Request, Response } from 'express';
import {
  getTransactionAuditTrail,
  generateComplianceReport,
  queryAuditTrail,
  getComplianceReport,
} from './audit-trail.service';

export class AuditTrailController {
  /**
   * Get transaction audit trail
   * GET /transaction/:transactionId
   */
  async getTransactionTrail(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { transactionId } = req.params;
      if (!transactionId) {
        return res.status(400).json({ error: 'transactionId is required' });
      }

      console.log(`[Audit Controller] Fetching trail: txn=${transactionId}, merchant=${merchantId}`);

      const trail = await getTransactionAuditTrail(transactionId);

      // Verify merchant access
      if (trail.merchantId !== merchantId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      res.json({
        success: true,
        trail,
      });
    } catch (e: any) {
      console.error('[Audit Controller] Error fetching transaction trail:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Query audit trail with filters
   * GET /query?merchantId=...&eventType=...&limit=50&offset=0
   */
  async queryTrail(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { transactionId, eventType, eventCategory, actor, dateFrom, dateTo } = req.query;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      console.log(
        `[Audit Controller] Querying audit trail: merchant=${merchantId}, eventType=${eventType}`
      );

      const result = await queryAuditTrail({
        merchantId,
        transactionId: transactionId as string,
        eventType: eventType as string,
        eventCategory: eventCategory as string,
        actor: actor as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        limit,
        offset,
      });

      res.json({
        success: true,
        ...result,
      });
    } catch (e: any) {
      console.error('[Audit Controller] Error querying audit trail:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Generate compliance report
   * POST /compliance-report
   * Body: { dateFrom, dateTo }
   */
  async generateReport(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { dateFrom, dateTo } = req.body || {};
      if (!dateFrom || !dateTo) {
        return res.status(400).json({ error: 'dateFrom and dateTo are required' });
      }

      console.log(
        `[Audit Controller] Generating compliance report: merchant=${merchantId}, period=${dateFrom} to ${dateTo}`
      );

      const report = await generateComplianceReport(merchantId, dateFrom, dateTo);

      res.json({
        success: true,
        report,
      });
    } catch (e: any) {
      console.error('[Audit Controller] Error generating compliance report:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }

  /**
   * Get compliance report
   * GET /compliance-report/:reportId
   */
  async getReport(req: Request, res: Response) {
    try {
      const merchantId = req.headers['x-merchant-id'] as string;
      if (!merchantId) {
        return res.status(401).json({ error: 'Missing merchant ID' });
      }

      const { reportId } = req.params;
      if (!reportId) {
        return res.status(400).json({ error: 'reportId is required' });
      }

      console.log(`[Audit Controller] Fetching report: ${reportId}, merchant=${merchantId}`);

      const report = await getComplianceReport(reportId);

      // Verify merchant access
      if (report.merchantId !== merchantId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      res.json({
        success: true,
        report,
      });
    } catch (e: any) {
      console.error('[Audit Controller] Error fetching compliance report:', e);
      res.status(500).json({
        success: false,
        error: e.message,
      });
    }
  }
}

export const auditTrailController = new AuditTrailController();
