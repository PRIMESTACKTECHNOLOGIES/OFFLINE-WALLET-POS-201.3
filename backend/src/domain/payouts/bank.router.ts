import { Router } from 'express';
import { debitMerchantWallet } from './payoutHelpers';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/db';
import { submitBankPayout, getWiseDiagnostics } from './payoutProvider.service';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

// GET /api/payout/bank/wise/diagnostics  (JWT-protected admin preflight)
// Returns profile, balances, and any configuration warnings. Run this from
// the Developer Dashboard to confirm Wise funding availability BEFORE submitting
// the first real payout (balance-insufficient = 402 response, no wallet debit).
router.get('/bank/wise/diagnostics', authenticateToken, async (req, res) => {
  const provider = (process.env.BANK_PAYOUT_PROVIDER || 'external').trim().toLowerCase();
  if (provider !== 'wise') {
    return res.status(400).json({
      ok: false,
      provider,
      error: 'BANK_PAYOUT_PROVIDER != wise. Diagnostics are only available for the native Wise provider.',
    });
  }
  try {
    const diag = await getWiseDiagnostics();
    return res.status(200).json({ ok: true, provider: 'wise', diagnostics: diag });
  } catch (e: any) {
    return res.status(502).json({
      ok: false,
      provider: 'wise',
      error: e.message || 'Wise diagnostics failed.',
    });
  }
});

// POST /api/merchant/:merchantId/payout/bank
router.post('/merchant/:merchantId/payout/bank', async (req, res) => {
  const { merchantId } = req.params as any;
  const { amount, bank_account } = req.body;

  if (!amount || amount <= 0 || !bank_account) return res.status(400).json({ error: 'Invalid payload' });

  const payoutProvider = process.env.BANK_PAYOUT_PROVIDER?.trim().toLowerCase();
  const payoutApiUrl = process.env.BANK_PAYOUT_API_URL?.trim();
  const payoutApiKey = process.env.BANK_PAYOUT_API_KEY?.trim() || process.env.WISE_API_KEY?.trim();

  const isWise = payoutProvider === 'wise';
  const isExternal = payoutProvider === 'external';

  if (!isWise && !isExternal) {
    return res.status(501).json({
      error: 'Bank payout is not enabled for production. Set BANK_PAYOUT_PROVIDER=wise (native Wise API) or BANK_PAYOUT_PROVIDER=external with BANK_PAYOUT_API_URL + API key.'
    });
  }

  if (isWise && !payoutApiKey) {
    return res.status(501).json({
      error: 'Wise payout provider requires WISE_API_KEY. Ensure the key is set in backend/.env and the Wise profile has a funded balance to cover payouts.'
    });
  }

  if (isExternal && (!payoutApiUrl || !payoutApiKey)) {
    return res.status(501).json({
      error: 'External payout provider requires both BANK_PAYOUT_API_URL and BANK_PAYOUT_API_KEY/WISE_API_KEY.'
    });
  }

  // ─── Wise PREFLIGHT: confirm sufficient balance BEFORE debiting wallet ─────
  //      Failure path here returns early — no wallet debit, no DB insert, no partial state.
  if (isWise) {
    try {
      const { balances, profileId } = (await getWiseDiagnostics()) as any;
      const currency = String(req.body?.currency || 'USD').toUpperCase();
      const bal = balances?.find((b: any) => String(b.currency || '').toUpperCase() === currency) || null;
      const available = Number(bal?.amount?.value || 0);
      if (!bal || available < Number(amount) * 1.005) {
        return res.status(402).json({
          error:
            `Insufficient Wise ${currency} balance for payout. ` +
            `Available: ${available.toFixed(2)} ${currency}, ` +
            `Requested: ${Number(amount).toFixed(2)} ${currency} (incl. ~0.5% fee headroom). ` +
            `Top up Wise at https://wise.com → Balances → ${currency}.`,
          wise: {
            profileId,
            balance: bal?.amount || null,
            reserveAvailable: available,
            currency,
          },
        });
      }
    } catch (e: any) {
      // If Wise is unreachable during preflight we hard-fail: the wallet debit
      // must NEVER happen if we can't verify funding.
      return res.status(502).json({
        error: `Wise preflight failed — unable to verify balance: ${e.message || String(e)}. Payout aborted to avoid stranded debits.`,
      });
    }
  }

  try {
    // Debit merchant wallet (includes ledger)
    await debitMerchantWallet(merchantId, Number(amount), 'payout', 'bank_payout', { bank_account });

    const payoutId = uuidv4();
    await db.query(
      `INSERT INTO merchant_payouts (id, merchant_id, amount, currency, bank_account, status, meta) VALUES (?, ?, ?, 'USD', ?, 'pending', ?)`,
      [payoutId, merchantId, amount, bank_account, JSON.stringify({ requested_by: 'admin' })]
    );

    const payoutResult = await submitBankPayout({
      merchantId,
      payoutId,
      amount: Number(amount),
      currency: 'USD',
      bankAccount: bank_account,
      reference: payoutId,
    });

    await db.query(
      `UPDATE merchant_payouts SET status = ?, provider_reference = ?, meta = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [payoutResult.status || 'submitted', payoutResult.providerReference || null, JSON.stringify({ provider: payoutResult.provider, raw: payoutResult.raw }), payoutId]
    );

    res.json({ ok: true, payout_id: payoutId, status: payoutResult.status || 'submitted', provider: payoutResult.provider, provider_reference: payoutResult.providerReference, message: 'Bank payout request submitted to live provider.' });
  } catch (e: any) {
    console.error('Bank payout error', e);
    res.status(400).json({ error: e.message });
  }
});

export default router;
