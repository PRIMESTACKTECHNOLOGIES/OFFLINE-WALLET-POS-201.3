import { Router } from 'express';
import { debitMerchantWallet } from './payoutHelpers';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/db';

const router = Router();
// POST /api/merchant/:merchantId/payout/crypto
router.post('/merchant/:merchantId/payout/crypto', async (req, res) => {
  const { merchantId } = req.params as any;
  const { amount_usd, asset, address, network } = req.body;

  if (!amount_usd || amount_usd <= 0 || !asset || !address || !network) return res.status(400).json({ error: 'Invalid payload' });

  // Use helper to debit merchant wallet (includes ledger)
  try {
    await debitMerchantWallet(merchantId, Number(amount_usd), 'payout_crypto', `crypto_withdrawal:${asset}`, { asset, address, network });

    // Call exchange withdraw
    const { withdrawAsset } = await import('../../exchange/binance.service');
    let withdrawalResult: any = null;
    try {
      withdrawalResult = await withdrawAsset(asset, address, network, Number(amount_usd));
    } catch (ex) {
      // If exchange fails, record failed withdrawal and return error
      const failedId = uuidv4();
      await db.query(`INSERT INTO merchant_crypto_withdrawals (id, merchant_id, amount_usd, asset, address, network, status, meta) VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)`, [failedId, merchantId, amount_usd, asset, address, network, JSON.stringify({ error: String(ex) })]);
      return res.status(500).json({ error: 'Exchange withdraw failed', details: String(ex) });
    }

    const withdrawalId = uuidv4();
    await db.query(
      `INSERT INTO merchant_crypto_withdrawals (id, merchant_id, amount_usd, asset, address, network, status, meta) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`,
      [withdrawalId, merchantId, amount_usd, asset, address, network, JSON.stringify(withdrawalResult)]
    );

    res.json({ ok: true, withdrawal_id: withdrawalId, status: 'completed', exchange_withdrawal: withdrawalResult });
  } catch (e: any) {
    console.error('Crypto payout error', e);
    res.status(400).json({ error: e.message });
  }
});

export default router;
