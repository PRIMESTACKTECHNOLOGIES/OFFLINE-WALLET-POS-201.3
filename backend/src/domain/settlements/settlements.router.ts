import { Router } from 'express';
import { db } from '../../config/db';
import { settlementReconciliationService } from './settlementReconciliation.service';
import { settlementsController } from './settlements.controller';
import { generatePain001, type Pain001Request } from './paymentInitiation.service';

const router = Router();

router.post('/merchant/:merchantId/payment-files/pain001', async (req, res) => {
  try {
    const result = await generatePain001(req.params.merchantId, req.body as Pain001Request);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.xml);
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Unable to generate payment initiation file' });
  }
});

// GET /api/merchant/:merchantId/settlements/unsettled
router.get('/merchant/:merchantId/settlements/unsettled', async (req, res) => {
  try {
    const { merchantId } = req.params as any;
    const result = await db.query(
      `SELECT s.id, s.amount, s.currency, s.created_at, s.meta,
             s.ledger_entry_id, l.created_at AS ledger_created_at
       FROM merchant_pos_settlements s
       LEFT JOIN ledger_entries l ON s.ledger_entry_id = l.id
       WHERE s.merchant_id = ? AND s.status = 'unsettled'
       ORDER BY s.created_at ASC`,
      [merchantId]
    );
    res.json(result.rows);
  } catch (e: any) { console.error(e); res.status(500).json({ error: e.message }); }
});

// POST /api/merchant/settlements/:settlementId/settle
// — Bank sent real money for a single POS sale — mark it settled.
router.post('/merchant/settlements/:settlementId/settle', async (req, res) => {
  const { settlementId } = req.params as any;
  const { note, external_ref, provider_ref, settled_by } = req.body || {};
  try {
    await db.query('BEGIN IMMEDIATE');
    const sel = await db.query('SELECT * FROM merchant_pos_settlements WHERE id = ? LIMIT 1', [settlementId]);
    if (!sel.rows.length) { await db.query('ROLLBACK'); return res.status(404).json({ error: 'Settlement not found' }); }
    const settlement = sel.rows[0];
    if (settlement.status === 'settled') { await db.query('ROLLBACK'); return res.status(400).json({ error: 'Already settled' }); }

    const metaUpdate = Object.assign(
      {},
      settlement.meta ? JSON.parse(settlement.meta) : {},
      { note: note || null, external_ref: external_ref || null, provider_ref: provider_ref || null, settled_by: settled_by || null }
    );
    await db.query(
      `UPDATE merchant_pos_settlements SET status = 'settled', settled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, meta = ? WHERE id = ?`,
      [JSON.stringify(metaUpdate), settlementId]
    );

    await db.query('COMMIT');
    res.json({ ok: true, status: 'settled', settlement_id: settlementId });
  } catch (e: any) {
    try { await db.query('ROLLBACK'); } catch (err) { /* ignore */ }
    console.error(e); res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/merchant/:merchantId/settlements/batch-settle
// — Bank settlement batch (EOD): settle multiple POS sales at once.
//   This is the normal "Bank sends real money → Mark POS sale settled" step.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/merchant/:merchantId/settlements/batch-settle', async (req, res) => {
  const { merchantId } = req.params as any;
  const {
    settlement_ids,
    external_batch_ref,
    provider_ref,
    note,
    settled_by,
  } = (req.body || {}) as {
    settlement_ids?: string[];
    external_batch_ref?: string;
    provider_ref?: string;
    note?: string;
    settled_by?: string;
  };
  try {
    const ids = Array.isArray(settlement_ids) ? settlement_ids.filter(s => typeof s === 'string' && s.trim()) : [];
    if (!ids.length) return res.status(400).json({ error: 'settlement_ids (non-empty array) is required' });

    await db.query('BEGIN IMMEDIATE');
    const placeholders = ids.map(() => '?').join(',');
    const existingQ = await db.query(
      `SELECT id, status, meta FROM merchant_pos_settlements
       WHERE merchant_id = ? AND id IN (${placeholders})`,
      [merchantId, ...ids]
    );
    if (!existingQ.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'No matching settlement rows found for this merchant' });
    }
    const rows: Array<{ id: string; status: string; meta: any }> = existingQ.rows as any;

    const alreadySettled = rows.filter(r => r.status === 'settled').map(r => r.id);
    if (alreadySettled.length) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Some rows already settled', already_settled: alreadySettled });
    }
    if (rows.length !== ids.length) {
      const found = new Set(rows.map(r => r.id));
      const missing = ids.filter(i => !found.has(i));
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Some settlement_ids do not exist for this merchant', missing_ids: missing });
    }

    let settledCount = 0;
    let totalAmount = 0;
    for (const row of rows) {
      const metaUpdate = Object.assign(
        {},
        row.meta ? (typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta) : {},
        { note: note || null, external_batch_ref: external_batch_ref || null, provider_ref: provider_ref || null, settled_by: settled_by || null }
      );
      const up = await db.query(
        `UPDATE merchant_pos_settlements SET status = 'settled', settled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, meta = ?
         WHERE id = ? AND status <> 'settled'`,
        [JSON.stringify(metaUpdate), row.id]
      );
      settledCount += (up.rowCount as number) || 0;
      // Read back amount (rows array has original row objects from SELECT but we didn't SELECT amount — re-query)
    }
    const amountQ = await db.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM merchant_pos_settlements WHERE id IN (${placeholders})`,
      ids
    );
    totalAmount = Number((amountQ.rows?.[0] as any)?.total ?? 0);

    await db.query('COMMIT');
    res.json({ ok: true, settled_count: settledCount, total_settled_amount: totalAmount, external_batch_ref: external_batch_ref || null });
  } catch (e: any) {
    try { await db.query('ROLLBACK'); } catch (_err) { /* ignore */ }
    console.error('[batch-settle]', e);
    res.status(500).json({ error: String(e?.message || e).slice(0, 500) });
  }
});

router.post('/merchant/:merchantId/settlements/reconcile', async (req, res) => {
  const { merchantId } = req.params as any;
  const { settlementDate } = req.body || {};
  try {
    const summary = await settlementReconciliationService.reconcileMerchantSettlements(merchantId, settlementDate);
    res.json(summary);
  } catch (e: any) {
    console.error('Reconciliation error:', e);
    res.status(500).json({ error: e.message || 'Reconciliation failed' });
  }
});

router.get('/merchant/:merchantId/settlements/discrepancies', async (req, res) => {
  const { merchantId } = req.params as any;
  const { status } = req.query as any;
  try {
    const rows = await settlementReconciliationService.listDiscrepancies(merchantId, status);
    res.json(rows);
  } catch (e: any) {
    console.error('Failed to fetch discrepancies:', e);
    res.status(500).json({ error: e.message || 'Unable to load discrepancies' });
  }
});

// ───────────────────────────────────────────────────────────────────────
// NEW PRODUCTION-READY SETTLEMENT ENDPOINTS (from settlement.service)
// ───────────────────────────────────────────────────────────────────────

/**
 * POST /settle
 * Settle a reconciliation batch - Credits merchant wallet for approved transactions
 * Requires: x-merchant-id header
 * Body: { reconciliationReportId, config?: { baseFeePercent?, fixedFeeAmount?, holdDays? } }
 */
router.post(
  "/settle",
  settlementsController.settleReconciliationBatch.bind(settlementsController)
);

/**
 * GET /summary
 * Get merchant settlement summary for a period
 * Requires: x-merchant-id header
 * Query: startDate?, endDate?
 */
router.get(
  "/summary",
  settlementsController.getMerchantSummary.bind(settlementsController)
);

/**
 * GET /batch/:batchId
 * Get settlement batch details
 * Requires: x-merchant-id header
 */
router.get(
  "/batch/:batchId",
  settlementsController.getBatchDetails.bind(settlementsController)
);

/**
 * GET /batches
 * List settlement batches for merchant (paginated)
 * Requires: x-merchant-id header
 * Query: limit=50, offset=0
 */
router.get(
  "/batches",
  settlementsController.listBatches.bind(settlementsController)
);

/**
 * POST /reverse
 * Reverse a settlement (for refunds/chargebacks)
 * Requires: x-merchant-id header
 * Body: { settlementId, reason }
 */
router.post(
  "/reverse",
  settlementsController.reverseSettlement.bind(settlementsController)
);

/**
 * POST /adjust
 * Adjust a settlement amount (partial refunds/corrections)
 * Requires: x-merchant-id header
 * Body: { settlementId, adjustmentAmount, reason }
 */
router.post(
  "/adjust",
  settlementsController.adjustSettlement.bind(settlementsController)
);

export default router;
