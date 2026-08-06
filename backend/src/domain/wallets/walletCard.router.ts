import { Router } from 'express';
import { db } from '../../config/db';

const router = Router();

// GET /api/wallet/card/:walletCode
// QR code scan entry point — returns wallet balance + customer info
// QR encodes: https://your-pos-app.example/wallet/PSW-4829-1037
// Then frontend calls this endpoint with the wallet_code portion.
router.get('/wallet/card/:walletCode', async (req, res) => {
  try {
    const { walletCode } = req.params as any;
    if (!walletCode) return res.status(400).json({ error: 'walletCode is required' });

    const result = await db.query(
      `SELECT cw.balance, cw.currency, cw.id AS wallet_id, cw.wallet_code,
              c.name AS customer_name, c.id AS customer_id, c.email AS customer_email, c.phone AS customer_phone
         FROM customer_wallets cw
         JOIN customers c ON cw.customer_id = c.id
        WHERE cw.wallet_code = ?
        LIMIT 1`,
      [walletCode]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const row = result.rows[0];
    res.json({
      wallet_code: row.wallet_code,
      wallet_id: row.wallet_id,
      balance: Number(row.balance ?? 0),
      currency: row.currency || 'USD',
      customer_name: row.customer_name,
      customer_id: row.customer_id,
      customer_email: row.customer_email || null,
      customer_phone: row.customer_phone || null,
    });
  } catch (e: any) {
    console.error('Wallet card lookup error', e);
    res.status(500).json({ error: e.message || 'Internal error' });
  }
});

// POST /api/wallet/card/scan  (optional alternative if you prefer POST with QR payload)
// body: { wallet_code: "PSW-4829-1037" }
router.post('/wallet/card/scan', async (req, res) => {
  try {
    const { wallet_code } = req.body || {};
    if (!wallet_code) return res.status(400).json({ error: 'wallet_code is required' });

    const result = await db.query(
      `SELECT cw.balance, cw.currency, cw.id AS wallet_id, cw.wallet_code,
              c.name AS customer_name, c.id AS customer_id
         FROM customer_wallets cw
         JOIN customers c ON cw.customer_id = c.id
        WHERE cw.wallet_code = ?
        LIMIT 1`,
      [wallet_code]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const row = result.rows[0];
    res.json({
      wallet_code: row.wallet_code,
      wallet_id: row.wallet_id,
      balance: Number(row.balance ?? 0),
      currency: row.currency || 'USD',
      customer_name: row.customer_name,
      customer_id: row.customer_id,
    });
  } catch (e: any) {
    console.error('Wallet card scan error', e);
    res.status(500).json({ error: e.message || 'Internal error' });
  }
});

export default router;
