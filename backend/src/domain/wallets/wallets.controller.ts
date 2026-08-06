import { Request, Response } from 'express';
import { walletsService } from './wallets.service';

export class WalletsController {

  // ── Fiat wallet ────────────────────────────────────────────────────────────
  async topup(req: Request, res: Response) {
    try {
      const { customerId, amount, source, reference } = req.body;
      if (!customerId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid payload' });
      await walletsService.topupWallet(customerId, amount, source, reference);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  async topupWithCard(req: Request, res: Response) {
    try {
      const { customerId, amount, cardNumber, panMasked, expiry, cvv, emvData } = req.body;
      if (!customerId || !amount || amount <= 0 || !cardNumber || !expiry || !cvv) {
        return res.status(400).json({ error: 'Invalid payload' });
      }
      if (!/^\d{2}\/\d{2}$/.test(expiry) || !/^\d{3,4}$/.test(cvv)) {
        return res.status(400).json({ error: 'Invalid card expiry or CVV' });
      }
      const effectivePanMasked = panMasked || this.maskPan(cardNumber);
      const result = await walletsService.topupWalletWithCard(customerId, amount, cardNumber, effectivePanMasked, expiry, cvv, emvData);
      res.json(result);
    } catch (e: any) {
      const status = e.message?.includes('authorization') || e.message?.includes('processor') ? 402 : 500;
      res.status(status).json({ error: e.message });
    }
  }

  private maskPan(cardNumber: string): string {
    if (cardNumber.length <= 4) return cardNumber;
    return '*'.repeat(cardNumber.length - 4) + cardNumber.slice(-4);
  }

  async debit(req: Request, res: Response) {
    try {
      const { customerId, amount, source, reference } = req.body;
      if (!customerId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid payload' });
      await walletsService.debitWallet(customerId, amount, source, reference);
      res.json({ success: true });
    } catch (e: any) {
      res.status(e.message === 'Insufficient balance' ? 400 : 500).json({ error: e.message });
    }
  }

  async getBalance(req: Request, res: Response) {
    try {
      res.json(await walletsService.getWalletBalance(req.params.customerId));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  async getTransactions(req: Request, res: Response) {
    try {
      res.json(await walletsService.getWalletTransactions(req.params.customerId));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  // ── Customers ──────────────────────────────────────────────────────────────
  async getCustomers(req: Request, res: Response) {
    try {
      res.json(await walletsService.getCustomers());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  async createCustomer(req: Request, res: Response) {
    try {
      const { name, email, phone } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      res.json(await walletsService.createCustomer(name, email, phone));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  // ── Wallet transfer ────────────────────────────────────────────────────────
  async walletTransfer(req: Request, res: Response) {
    try {
      const { senderCustomerId, receiverCustomerId, amount, note } = req.body;
      if (!senderCustomerId || !receiverCustomerId || !amount || amount <= 0)
        return res.status(400).json({ error: 'Invalid payload' });
      res.json(await walletsService.walletTransfer(senderCustomerId, receiverCustomerId, amount, note));
    } catch (e: any) {
      res.status(e.message.includes('Insufficient') ? 400 : 500).json({ error: e.message });
    }
  }

  // ── Virtual cards ──────────────────────────────────────────────────────────
  async issueVirtualCard(req: Request, res: Response) {
    try {
      const {
        customerId,
        cardholderName,
        cardNumber,
        maskedNumber,
        expiryMonth,
        expiryYear,
        cvv,
        cardType,
        currency,
        dailyLimit,
      } = req.body;

      if (!customerId) return res.status(400).json({ error: 'customerId is required' });
      if (!cardholderName) return res.status(400).json({ error: 'cardholderName is required' });

      const requiredCardFields = [cardNumber, maskedNumber, expiryMonth, expiryYear, cvv];
      const hasExternalCardDetails = requiredCardFields.every(f => f !== undefined && f !== null && f !== '');

      let finalCardNumber = cardNumber;
      let finalMaskedNumber = maskedNumber;
      let finalExpiryMonth = expiryMonth;
      let finalExpiryYear = expiryYear;
      let finalCvv = cvv;

      if (!hasExternalCardDetails) {
        const generated = await walletsService.generateCardCredentials(cardType || 'VISA');
        finalCardNumber = generated.cardNumber;
        finalMaskedNumber = generated.maskedNumber;
        finalExpiryMonth = generated.expiryMonth;
        finalExpiryYear = generated.expiryYear;
        finalCvv = generated.cvv;
      }

      if (typeof finalExpiryMonth !== 'number') {
        finalExpiryMonth = Number(finalExpiryMonth);
      }
      if (typeof finalExpiryYear !== 'number') {
        finalExpiryYear = Number(finalExpiryYear);
      }
      if (typeof finalExpiryMonth !== 'number' || typeof finalExpiryYear !== 'number' ||
          isNaN(finalExpiryMonth) || isNaN(finalExpiryYear)) {
        return res.status(400).json({ error: 'expiryMonth and expiryYear must be numbers' });
      }

      const result = await walletsService.issueVirtualCard(customerId, {
        cardNumber: finalCardNumber,
        maskedNumber: finalMaskedNumber,
        expiryMonth: finalExpiryMonth,
        expiryYear: finalExpiryYear,
        cvv: finalCvv,
        cardholderName,
        cardType,
        currency,
        dailyLimit,
      });

      res.json({
        ...result,
        cardNumber: finalCardNumber,
        cvv: finalCvv,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  async getVirtualCards(req: Request, res: Response) {
    try {
      res.json(await walletsService.getVirtualCards(req.params.customerId));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  async topupVirtualCard(req: Request, res: Response) {
    try {
      const { customerId, cardId, amount } = req.body;
      if (!customerId || !cardId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid payload' });
      res.json(await walletsService.topupVirtualCard(customerId, cardId, amount));
    } catch (e: any) {
      res.status(e.message.includes('Insufficient') ? 400 : 500).json({ error: e.message });
    }
  }

  async freezeVirtualCard(req: Request, res: Response) {
    try {
      const { customerId, cardId } = req.body;
      if (!customerId || !cardId) return res.status(400).json({ error: 'customerId and cardId required' });
      res.json(await walletsService.freezeVirtualCard(customerId, cardId));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  async unfreezeVirtualCard(req: Request, res: Response) {
    try {
      const { customerId, cardId } = req.body;
      if (!customerId || !cardId) return res.status(400).json({ error: 'customerId and cardId required' });
      res.json(await walletsService.unfreezeVirtualCard(customerId, cardId));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  // ── Bank accounts ──────────────────────────────────────────────────────────
  async addBankAccount(req: Request, res: Response) {
    try {
      const { customerId, bankName, accountHolder, accountNumber, routingNumber, iban, swiftCode, currency } = req.body;
      if (!customerId || !bankName || !accountHolder || !accountNumber)
        return res.status(400).json({ error: 'Missing required fields' });
      res.json(await walletsService.addBankAccount(customerId, { bankName, accountHolder, accountNumber, routingNumber, iban, swiftCode, currency }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  async getBankAccounts(req: Request, res: Response) {
    try {
      res.json(await walletsService.getBankAccounts(req.params.customerId));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  // ── Bank payouts ───────────────────────────────────────────────────────────
  async bankPayout(req: Request, res: Response) {
    try {
      const { customerId, bankAccountId, amount } = req.body;
      if (!customerId || !bankAccountId || !amount || amount <= 0)
        return res.status(400).json({ error: 'Invalid payload' });
      res.json(await walletsService.bankPayout(customerId, bankAccountId, amount));
    } catch (e: any) {
      res.status(e.message.includes('Insufficient') || e.message.includes('not found') ? 400 : 500).json({ error: e.message });
    }
  }

  async getBankPayouts(req: Request, res: Response) {
    try {
      res.json(await walletsService.getBankPayouts(req.params.customerId));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  // ── Crypto ─────────────────────────────────────────────────────────────────
  async getCryptoWallets(req: Request, res: Response) {
    try {
      res.json(await walletsService.getCustomerCryptoWallets(req.params.customerId));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  async getCryptoPrice(req: Request, res: Response) {
    try {
      const { cryptoCoin } = req.params;
      const price = await walletsService.getCryptoPrice(cryptoCoin);
      res.json({ cryptoCoin, price, timestamp: Date.now() });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  async buyCryptoWithWallet(req: Request, res: Response) {
    try {
      const { customerId, cryptoCoin, fiatAmount, network } = req.body;
      if (!customerId || !cryptoCoin || !fiatAmount || fiatAmount <= 0)
        return res.status(400).json({ error: 'Invalid payload' });
      res.json(await walletsService.buyCryptoWithWallet(customerId, cryptoCoin, fiatAmount, network));
    } catch (e: any) {
      res.status(e.message.includes('Insufficient') ? 400 : 500).json({ error: e.message });
    }
  }

  async sellCrypto(req: Request, res: Response) {
    try {
      const { customerId, cryptoCoin, cryptoAmount, network } = req.body;
      if (!customerId || !cryptoCoin || !cryptoAmount || cryptoAmount <= 0)
        return res.status(400).json({ error: 'Invalid payload' });
      res.json(await walletsService.sellCrypto(customerId, cryptoCoin, cryptoAmount, network));
    } catch (e: any) {
      res.status(e.message.includes('Insufficient') ? 400 : 500).json({ error: e.message });
    }
  }

  async getCryptoTransactions(req: Request, res: Response) {
    try {
      res.json(await walletsService.getCryptoTransactions(req.params.customerId));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  // Merchant: buy crypto using merchant wallet funds
  async buyCryptoWithMerchant(req: Request, res: Response) {
    try {
      const { merchantId, cryptoCoin, fiatAmount, network } = req.body;
      if (!merchantId || !cryptoCoin || !fiatAmount || fiatAmount <= 0)
        return res.status(400).json({ error: 'Invalid payload' });
      res.json(await walletsService.buyCryptoWithMerchant(merchantId, cryptoCoin, fiatAmount, network));
    } catch (e: any) {
      res.status(e.message.includes('Insufficient') ? 400 : 500).json({ error: e.message });
    }
  }

  // ── Merchant wallet (auto-credited on batch sync) ─────────────────────────
  async getMerchantBalance(req: Request, res: Response) {
    try {
      const { merchantId } = req.params;
      const wallet = await walletsService.getOrCreateMerchantWallet(merchantId);
      res.json({ balance: wallet.balance, currency: wallet.currency, merchantId });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }

  async getMerchantTransactions(req: Request, res: Response) {
    try {
      const { merchantId } = req.params;
      const wallet = await walletsService.getOrCreateMerchantWallet(merchantId);
      const { db } = await import('../../config/db');
      const res2 = await db.query(
        'SELECT * FROM merchant_wallet_transactions WHERE wallet_id = ? ORDER BY created_at DESC LIMIT 100',
        [wallet.id]
      );
      res.json(res2.rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  }
}

export const walletsController = new WalletsController();
