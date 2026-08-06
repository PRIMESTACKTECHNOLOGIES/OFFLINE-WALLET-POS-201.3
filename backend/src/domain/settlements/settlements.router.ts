import { Router } from 'express';
import { db } from '../../config/db';
import { settlementReconciliationService } from './settlementReconciliation.service';

const router = Router();

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
router.post('/merchant/settlements/:settlementId/settle', async (req, res) => {
  const { settlementId } = req.params as any;
  const { note, external_ref } = req.body || {};
  try {
    await db.query('BEGIN IMMEDIATE');
    const sel = await db.query('SELECT * FROM merchant_pos_settlements WHERE id = ? LIMIT 1', [settlementId]);
    if (!sel.rows.length) { await db.query('ROLLBACK'); return res.status(404).json({ error: 'Settlement not found' }); }
    const settlement = sel.rows[0];
    if (settlement.status === 'settled') { await db.query('ROLLBACK'); return res.status(400).json({ error: 'Already settled' }); }

    const metaUpdate = Object.assign({}, settlement.meta ? JSON.parse(settlement.meta) : {}, { note, external_ref });
    await db.query(
      `UPDATE merchant_pos_settlements SET status = 'settled', settled_at = CURRENT_TIMESTAMP, meta = ? WHERE id = ?`,
      [JSON.stringify(metaUpdate), settlementId]
    );

    await db.query('COMMIT');
    res.json({ ok: true, status: 'settled' });
  } catch (e: any) {
    try { await db.query('ROLLBACK'); } catch (err) { /* ignore */ }
    console.error(e); res.status(500).json({ error: e.message });
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

export default router;
