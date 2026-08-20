import express from 'express';
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
 * Withdraw crypto to external address
 */
router.post('/wallets/:customerId/withdraw-crypto', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { coin, network, amount, destination_address } = req.body;
    const user = getUser(req);

    if (user?.customer_id && user.customer_id !== customerId && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!coin || !network || !amount || !destination_address) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    res.status(501).json({ error: 'Crypto withdrawal not yet implemented' });
  } catch (err: any) {
    console.error('Failed to withdraw crypto:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /crypto/prices
 * Get real-time crypto prices
 */
router.get('/crypto/prices', async (_req, res) => {
  try {
    const prices: Record<string, number> = {};
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
