import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { cryptoWalletsService } from '../domain/wallets/crypto-wallets.service';
import { transakService } from '../domain/wallets/transak.service';
import { cryptoOpsService } from '../domain/wallets/crypto-operations.service';
import { authenticateToken } from '../middleware/auth.middleware';
import { db } from '../config/db';

const router = express.Router();

const getUser = (req: express.Request) => (req as any).user as { customer_id?: string; role?: string } | undefined;

/**
 * GET /wallets/:customerId/balance
 * Get complete wallet balance (fiat + crypto)
 */
router.get('/wallets/:customerId/balance', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const user = getUser(req);

    if (user?.customer_id && user.customer_id !== customerId && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const snapshot = await cryptoWalletsService.getWalletSnapshot(customerId);
    res.json(snapshot);
  } catch (err: any) {
    console.error('Failed to get wallet balance:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /wallets/:customerId/crypto-holdings
 * List all crypto holdings for a customer
 */
router.get('/wallets/:customerId/crypto-holdings', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const user = getUser(req);

    if (user?.customer_id && user.customer_id !== customerId && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const holdings = await cryptoWalletsService.listCryptoHoldings(customerId);
    res.json({ holdings });
  } catch (err: any) {
    console.error('Failed to list crypto holdings:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /wallets/:customerId/buy-crypto
 * Initiate crypto purchase (via Transak or other provider)
 */
router.post('/wallets/:customerId/buy-crypto', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { amount_usd, crypto_currency, network, payment_method, wallet_address } = req.body;
    const user = getUser(req);

    if (user?.customer_id && user.customer_id !== customerId && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!amount_usd || !crypto_currency || !network) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await cryptoOpsService.buyCrypto({
      customer_id: customerId,
      amount_usd,
      crypto_currency: crypto_currency.toUpperCase(),
      network: network.toLowerCase(),
      payment_method: payment_method || 'transak',
      wallet_address,
    });

    res.json(result);
  } catch (err: any) {
    console.error('Failed to initiate crypto purchase:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /wallets/:customerId/swap
 * Swap between cryptos
 */
router.post('/wallets/:customerId/swap', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { from_coin, from_network, to_coin, to_network, amount } = req.body;
    const user = getUser(req);

    if (user?.customer_id && user.customer_id !== customerId && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!from_coin || !from_network || !to_coin || !to_network || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await cryptoOpsService.swapCrypto({
      customer_id: customerId,
      from_coin: from_coin.toUpperCase(),
      from_network: from_network.toLowerCase(),
      to_coin: to_coin.toUpperCase(),
      to_network: to_network.toLowerCase(),
      amount: parseFloat(amount),
    });

    res.json(result);
  } catch (err: any) {
    console.error('Failed to swap crypto:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /wallets/:customerId/withdraw-crypto
 * Withdraw crypto to an external blockchain address.
 *
 * Body:
 *   coin              — asset symbol: USDT, ETH, BNB, TRX, etc.
 *   network           — tron | bsc | polygon | ethereum | trc20 | bep20
 *   amount            — amount to withdraw (in coin units)
 *   destination_address — recipient's external blockchain address
 *
 * Flow:
 *   1. Validate customer owns the requested internal crypto balance
 *   2. Debit internal crypto wallet (FINAL — no rollback)
 *   3. Route to direct blockchain rail (tronweb → TRC-20, bscweb → BEP-20, polygonweb → Polygon)
 *   4. Record withdrawal in customer_crypto_withdrawals table
 *   5. Return status: completed | deferred_broadcast | pending_manual
 */
router.post('/wallets/:customerId/withdraw-crypto', authenticateToken, async (req, res) => {
  const { customerId } = req.params;
  const { coin, network, amount, destination_address } = req.body;
  const user = getUser(req);

  // Auth: customer can only withdraw their own funds; admins can act on any account
  if (user?.customer_id && user.customer_id !== customerId && user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // Input validation
  if (!coin || !network || !amount || !destination_address) {
    return res.status(400).json({ error: 'Missing required fields: coin, network, amount, destination_address' });
  }
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const coinUpper = String(coin).toUpperCase();
  const networkLower = String(network).toLowerCase();
  const ref = `CW-${Date.now()}`;
  const withdrawalId = uuidv4();

  try {
    // ── 1. Check internal crypto balance ────────────────────────────────────
    const walletRes = await db.query(
      `SELECT * FROM customer_crypto_wallets_v2
       WHERE customer_id = ? AND coin = ? AND network = ?
       ORDER BY quantity DESC LIMIT 1`,
      [customerId, coinUpper, networkLower]
    );
    // Also check legacy customer_crypto_wallets table
    const legacyRes = await db.query(
      `SELECT * FROM customer_crypto_wallets
       WHERE customer_id = ? AND crypto_coin = ?
       ORDER BY balance DESC LIMIT 1`,
      [customerId, coinUpper]
    );

    const v2Wallet = walletRes.rows[0];
    const legacyWallet = legacyRes.rows[0];

    const v2Balance = Number(v2Wallet?.quantity ?? 0);
    const legacyBalance = Number(legacyWallet?.balance ?? 0);
    const totalBalance = v2Balance + legacyBalance;

    if (totalBalance < amountNum) {
      return res.status(400).json({
        error: 'Insufficient crypto balance',
        available: totalBalance,
        requested: amountNum,
        coin: coinUpper,
      });
    }

    // ── 2. Debit internal wallet (FINAL — no rollback after this point) ─────
    // Deduct from v2 first, then legacy if needed
    let remaining = amountNum;
    if (v2Balance > 0 && v2Wallet) {
      const deductV2 = Math.min(remaining, v2Balance);
      await db.query(
        `UPDATE customer_crypto_wallets_v2
         SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [deductV2, v2Wallet.id]
      );
      await db.query(
        `INSERT INTO crypto_wallet_transactions_v2
         (id, customer_id, coin, network, transaction_type, from_currency, to_currency,
          from_amount, to_amount, exchange_rate, source, reference, status, created_at)
         VALUES (?, ?, ?, ?, 'withdraw', ?, ?, ?, 0, 0, 'blockchain_withdrawal', ?, 'PENDING', CURRENT_TIMESTAMP)`,
        [uuidv4(), customerId, coinUpper, networkLower, coinUpper, coinUpper, deductV2, ref]
      );
      remaining -= deductV2;
    }
    if (remaining > 0 && legacyWallet) {
      const deductLegacy = Math.min(remaining, legacyBalance);
      await db.query(
        `UPDATE customer_crypto_wallets
         SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [deductLegacy, legacyWallet.id]
      );
      remaining -= deductLegacy;
    }

    // ── 3. Route to direct blockchain rail ──────────────────────────────────
    const xr = await import('../exchange/exchange-router.service');
    const directRail = await xr.detectDirectRailForDestination(destination_address, network);

    let finalStatus: 'completed' | 'deferred_broadcast' | 'pending_manual' = 'pending_manual';
    let provider = 'unknown';
    let txId: string | undefined;
    let txUrl: string | undefined;
    let broadcastResult: any = {};

    if (coinUpper === 'USDT' && directRail) {
      // Direct on-chain USDT send (TRC-20 / BEP-20 / Polygon)
      try {
        const result = await xr.directRailWithdraw(directRail, coinUpper, destination_address, amountNum, {
          senderMode: 'auto',
        });
        provider = String(result.provider || directRail);
        broadcastResult = result;

        if (result.deferred) {
          finalStatus = 'deferred_broadcast';
        } else if (result.ok && result.txId) {
          finalStatus = 'completed';
          txId = result.txId;
          txUrl = result.txUrl ?? undefined;
        } else {
          finalStatus = 'pending_manual';
        }
      } catch (railErr: any) {
        finalStatus = 'pending_manual';
        provider = directRail;
        broadcastResult = {
          error: String(railErr?.message || railErr),
          note: 'Direct rail broadcast failed. Insufficient gas (TRX/BNB/MATIC) or misconfigured hot wallet. Top up gas and retry.',
        };
      }
    } else if (coinUpper !== 'USDT') {
      // Non-USDT: attempt exchange withdrawal (Binance / KuCoin)
      try {
        const attempt = await xr.exchangeWithdrawBestEffort(coinUpper, destination_address, network, amountNum);
        if (attempt.result.ok && attempt.result.accepted) {
          finalStatus = 'completed';
          provider = String(attempt.providerUsed);
          txId = attempt.result.txId;
          broadcastResult = attempt.result;
        } else {
          finalStatus = 'pending_manual';
          provider = 'exchange';
          broadcastResult = {
            error: attempt.lastError,
            note: `Exchange withdrawal failed. Configure BINANCE_API_KEY or KUCOIN_API_KEY in .env to enable ${coinUpper} withdrawals.`,
          };
        }
      } catch (exErr: any) {
        finalStatus = 'pending_manual';
        provider = 'exchange';
        broadcastResult = {
          error: String(exErr?.message || exErr),
          note: `Exchange path error for ${coinUpper}. Configure exchange API keys in .env.`,
        };
      }
    } else {
      // USDT but no rail detected (unknown address format)
      finalStatus = 'pending_manual';
      provider = 'none';
      broadcastResult = {
        error: 'Could not detect blockchain rail for destination address.',
        note: 'For USDT use a T-address (TRC-20), 0x-address (BEP-20/Polygon), or specify network explicitly.',
        destination: destination_address,
      };
    }

    // ── 4. Persist withdrawal record ────────────────────────────────────────
    await db.query(
      `INSERT INTO customer_crypto_withdrawals
       (id, customer_id, coin, network, amount, destination_address, status, provider, ref, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        withdrawalId, customerId, coinUpper, networkLower, amountNum,
        destination_address, finalStatus, provider, ref,
        JSON.stringify({ ...broadcastResult, debit_final: true }),
      ]
    );

    // ── 5. Respond ──────────────────────────────────────────────────────────
    const summaryMap: Record<string, string> = {
      completed:          `${amountNum} ${coinUpper} sent on-chain. TxID: ${txId || 'see txUrl'}`,
      deferred_broadcast: `${amountNum} ${coinUpper} debited. On-chain broadcast deferred — hot wallet needs more ${coinUpper}. Will auto-retry.`,
      pending_manual:     `${amountNum} ${coinUpper} debited. On-chain settlement requires manual review.`,
    };

    return res.json({
      ok: true,
      withdrawal_id: withdrawalId,
      ref,
      customer_id: customerId,
      coin: coinUpper,
      network: networkLower,
      amount: amountNum,
      destination_address,
      status: finalStatus,
      provider,
      tx_id: txId || null,
      tx_url: txUrl || null,
      debit_final: true,
      action_required: finalStatus === 'pending_manual',
      auto_retryable: finalStatus === 'deferred_broadcast',
      summary: summaryMap[finalStatus],
      ...(finalStatus !== 'completed' ? { detail: broadcastResult } : {}),
    });
  } catch (err: any) {
    console.error('[withdraw-crypto] Unexpected error:', err);
    // Try to record a pending_manual entry so accounting is auditable
    try {
      await db.query(
        `INSERT INTO customer_crypto_withdrawals
         (id, customer_id, coin, network, amount, destination_address, status, provider, ref, meta, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending_manual', 'error', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [withdrawalId, customerId, coinUpper, networkLower, amountNum, destination_address, ref,
         JSON.stringify({ error: String(err?.message || err), debit_final: 'VERIFY_LEDGER' })]
      );
    } catch { /* DB unavailable — nothing more to do */ }

    return res.status(500).json({
      ok: false,
      error: 'Unexpected withdrawal error. Internal balance may have been debited — check your wallet.',
      withdrawal_id: withdrawalId,
      ref,
    });
  }
});

/**
 * GET /crypto/prices
 * Get real-time crypto prices for common coins
 */
router.get('/crypto/prices', async (_req, res) => {
  try {
    const xr = await import('../exchange/exchange-router.service');
    const coins = ['BTC', 'ETH', 'USDT', 'BNB', 'TRX', 'MATIC', 'SOL', 'USDC'];
    const prices: Record<string, number> = {};
    await Promise.allSettled(
      coins.map(async (coin) => {
        try {
          const result = await xr.getBestPrice(coin);
          prices[coin] = result.priceUsd;
        } catch { /* skip unavailable coins */ }
      })
    );
    res.json(prices);
  } catch (err: any) {
    console.error('Failed to get crypto prices:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /transak/widget-token/:customerId
 * Generate Transak widget access token
 */
router.get('/transak/widget-token/:customerId', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const user = getUser(req);

    if (user?.customer_id && user.customer_id !== customerId && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const token = transakService.generateWidgetToken(customerId);
    const widgetUrl = transakService.getWidgetUrl(customerId);

    res.json({ token, widgetUrl });
  } catch (err: any) {
    console.error('Failed to generate widget token:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /transak/orders/:customerId
 * List customer Transak orders
 */
router.get('/transak/orders/:customerId', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { limit = 20 } = req.query;
    const user = getUser(req);

    if (user?.customer_id && user.customer_id !== customerId && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const orders = await transakService.listCustomerOrders(customerId, parseInt(limit as string));
    res.json({ orders });
  } catch (err: any) {
    console.error('Failed to list Transak orders:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /webhooks/transak
 * Transak webhook receiver (order status updates)
 */
router.post('/webhooks/transak', async (req, res) => {
  try {
    const signature = req.headers['x-transak-signature'] as string;
    const payload = JSON.stringify(req.body);

    const secret = process.env.TRANSAK_WEBHOOK_SECRET || '';
    const isValid = transakService.verifyWebhookSignature(payload, signature, secret);

    if (!isValid) {
      console.warn('[Transak] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    await transakService.handleWebhook(req.body);
    res.json({ success: true, message: 'Webhook processed' });
  } catch (err: any) {
    console.error('[Transak] Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /wallets/:customerId/transaction-history
 * Get transaction history (fiat + crypto)
 */
router.get('/wallets/:customerId/transaction-history', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const user = getUser(req);

    if (user?.customer_id && user.customer_id !== customerId && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const fiatRes = await db.query(
      `SELECT * FROM wallet_transactions
       WHERE customer_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [customerId, limit, offset]
    );

    const cryptoRes = await db.query(
      `SELECT * FROM crypto_wallet_transactions_v2
       WHERE customer_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [customerId, limit, offset]
    );

    const transactions = [
      ...(fiatRes.rows || []).map((t: any) => ({ type: 'fiat', ...t })),
      ...(cryptoRes.rows || []).map((t: any) => ({ type: 'crypto', ...t })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({ transactions });
  } catch (err: any) {
    console.error('Failed to get transaction history:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
