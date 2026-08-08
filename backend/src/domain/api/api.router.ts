import { Router } from 'express';
import { walletsService } from '../wallets/wallets.service';
import { walletsController } from '../wallets/wallets.controller';
import { db } from '../../config/db';

const router = Router();

// POST /api/customers
router.post('/customers', async (req, res) => {
  try {
    const { name, email, phone } = req.body || {};
    const trimmedName = (name || '').trim();
    if (!trimmedName) return res.status(400).json({ error: 'Name is required' });
    const customer = await walletsService.createCustomer(trimmedName, email, phone);
    const wallet = await walletsService.getOrCreateWallet(customer.id);
    res.json({
      customer_id: customer.id,
      customer_name: customer.name,
      wallet: { id: wallet.id, balance: Number(wallet.balance), currency: wallet.currency, wallet_code: wallet.wallet_code }
    });
  } catch (e: any) { res.status(e.message.includes('required') || e.message.includes('at least') || e.message.includes('too long') ? 400 : 500).json({ error: e.message }); }
});

// POST /api/wallet/customer/topup
router.post('/wallet/customer/topup', async (req, res) => {
  try {
    const { customer_id, amount, source, reference, currency } = req.body;
    if (!customer_id || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid payload' });
    await walletsService.topupWallet(customer_id, amount, source || 'admin', reference, currency || 'USD');
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/wallet/customer/:customerId/balance
router.get('/wallet/customer/:customerId/balance', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { currency } = req.query as any;
    const b = await walletsService.getWalletBalance(customerId, currency as string | undefined);
    res.json({ balance: Number(b.balance), currency: b.currency });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/wallet/merchant/:merchantId/balance
router.get('/wallet/merchant/:merchantId/balance', async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { currency } = req.query as any;
    const wallet = await walletsService.getOrCreateMerchantWallet(merchantId, (currency as string) || 'USD');
    res.json({ balance: Number(wallet.balance), currency: wallet.currency });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/wallet/merchant/:merchantId/balances (all currencies)
router.get('/wallet/merchant/:merchantId/balances', async (req, res) => {
  try {
    const { merchantId } = req.params;
    const wallets = await walletsService.listMerchantWallets(merchantId);
    res.json({ wallets: wallets.map((w: any) => ({ balance: Number(w.balance), currency: w.currency, id: w.id })) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/wallet/customer/:customerId/balances (all currencies)
router.get('/wallet/customer/:customerId/balances', async (req, res) => {
  try {
    const { customerId } = req.params;
    const wallets = await walletsService.listCustomerWallets(customerId);
    res.json({ wallets: wallets.map((w: any) => ({ balance: Number(w.balance), currency: w.currency, wallet_code: w.wallet_code, id: w.id })) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/pos/offline-sale
// Accept either single transaction or batch in `transactions` array
router.post('/pos/offline-sale', async (req, res) => {
  try {
    const body = req.body;
    const merchantId = body.merchant_id || body.merchantId;
    if (!merchantId) return res.status(400).json({ error: 'merchant_id required' });

    const processTxn = async (txn: any) => {
      const amount = Number(txn.amount);
      if (!amount || amount <= 0) throw new Error('invalid amount');
      const txnCurrency = String(txn.currency || txn.ccy || 'USD').toUpperCase().trim();
      const stan = txn.stan;
      const rrn = txn.rrn;
      const card_masked = txn.card_masked;
      const creditResult = await walletsService.creditMerchantWallet(
        merchantId, amount, 'pos_offline', rrn || stan || null, txnCurrency
      );
      // Insert settlement record for reconciliation
      try {
        const settlementId = require('uuid').v4();
        await db.query(
          `INSERT INTO merchant_pos_settlements (id, merchant_id, ledger_entry_id, amount, currency, status, created_at, meta)
           VALUES (?, ?, ?, ?, ?, 'unsettled', CURRENT_TIMESTAMP, ?)`,
          [settlementId, merchantId, creditResult.ledgerEntryId || null, amount, txnCurrency, JSON.stringify({ stan, rrn, card_masked })]
        );
      } catch (err) {
        console.error('Failed to insert settlement record', err);
        throw err;
      }
    };

    if (Array.isArray(body.transactions)) {
      for (const t of body.transactions) await processTxn(t);
    } else {
      await processTxn(body);
    }

    res.json({ ok: true });
  } catch (e: any) { console.error(e); res.status(500).json({ error: e.message }); }
});

// POST /api/merchant/:merchantId/crypto/purchase
router.post('/merchant/:merchantId/crypto/purchase', async (req, res) => {
  try {
    const { merchantId } = req.params as any;
    const { amount_usd, asset } = req.body;
    if (!amount_usd || amount_usd <= 0 || !asset) return res.status(400).json({ error: 'Invalid payload' });

    // Begin transaction
    await db.query('BEGIN IMMEDIATE');
    try {
      const wallet = await walletsService.getOrCreateMerchantWallet(merchantId);
      const balRes = await db.query('SELECT balance FROM merchant_wallets WHERE id = ?', [wallet.id]);
      const balance = Number(balRes.rows[0]?.balance ?? 0);
      if (balance < amount_usd) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Debit merchant wallet
      await db.query('UPDATE merchant_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount_usd, wallet.id]);

      // ledger entry
      const { createLedgerEntry, validateTransition, persistLedgerEntry } = await import('../ledger/ledger.service');
      const txnId = require('uuid').v4();
      const ledgerEntry = createLedgerEntry(txnId, 'debit', amount_usd, 'USD', 'AUTHORIZED', `Crypto purchase: ${asset}`);
      validateTransition('PENDING', ledgerEntry.status);
      await persistLedgerEntry(ledgerEntry, db.query.bind(db));

      // Call the configured crypto provider (Binance by default, or custom endpoint)
      let orderResult: any = null;
      try {
        const provider = (process.env.CRYPTO_PROVIDER || 'binance').toLowerCase();
        if (provider === 'custom') {
          const { purchaseCryptoWithCustomApi } = await import('../../exchange/custom-crypto.service');
          orderResult = await purchaseCryptoWithCustomApi(asset, amount_usd, merchantId);
        } else {
          const { buyAssetWithUsd } = await import('../../exchange/binance.service');
          orderResult = await buyAssetWithUsd(asset, amount_usd);
        }
      } catch (ex) {
        // If exchange fails, rollback
        await db.query('ROLLBACK');
        throw ex;
      }

      // Persist merchant crypto balance
      const cryptoId = require('uuid').v4();
      const executedQty = parseFloat(orderResult.executedQty || orderResult.fills?.reduce((s: number, f: any) => s + parseFloat(f.qty || 0), 0) || 0);
      await db.query(
        `INSERT INTO merchant_crypto_balances (id, merchant_id, asset, amount, meta, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [cryptoId, merchantId, asset.toUpperCase(), executedQty, JSON.stringify(orderResult)]
      );

      await db.query('COMMIT');
      res.json({ ok: true, asset: asset.toUpperCase(), amount_usd, executed_qty: executedQty, exchange_order: orderResult });
    } catch (err: any) {
      try { await db.query('ROLLBACK'); } catch (_) {}
      throw err;
    }
  } catch (e: any) { console.error(e); res.status(500).json({ error: e.message }); }
});

export default router;

// Wallet card lookup by wallet_code
router.get('/wallet/card/:walletCode', async (req, res) => {
  try {
    const { walletCode } = req.params as any;
    const result = await db.query(
      `SELECT cw.balance, cw.currency, cw.wallet_code, c.name AS customer_name, c.id AS customer_id
       FROM customer_wallets cw
       LEFT JOIN customers c ON cw.customer_id = c.id
       WHERE cw.wallet_code = ?`,
      [walletCode]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Wallet not found' });
    const r = result.rows[0];
    res.json({ wallet_code: r.wallet_code, balance: Number(r.balance), currency: r.currency, customer_name: r.customer_name, customer_id: r.customer_id });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
