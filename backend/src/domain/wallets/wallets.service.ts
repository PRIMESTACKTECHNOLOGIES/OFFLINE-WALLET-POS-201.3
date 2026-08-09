import axios from "axios";
import { db } from "../../config/db";
import { v4 as uuidv4 } from 'uuid';
import { validateTransition, createLedgerEntry, persistLedgerEntry, type TransactionState } from '../ledger/ledger.service';

interface VirtualCardDetails {
  cardNumber?: string;
  maskedNumber?: string;
  expiryMonth?: number;
  expiryYear?: number;
  cvv?: string;
  cardholderName?: string;
  cardType?: string;
  currency?: string;
  dailyLimit?: number;
}

export class WalletsService {

  private normalizeCurrency(c: any): string {
    const raw = (c || 'USD').toString().toUpperCase().trim();
    if (!raw) return 'USD';
    return raw;
  }

  // ── Wallet helpers ───────────────────────────────────────────────────────────
  async getOrCreateWallet(customerId: string, currency: string = 'USD') {
    const ccy = this.normalizeCurrency(currency);
    const res = await db.query(
      'SELECT * FROM customer_wallets WHERE customer_id = ? AND currency = ?',
      [customerId, ccy]
    );
    if (res.rows.length) return res.rows[0];
    const id = uuidv4();
    const walletCode = `PSW-${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`;
    await db.query(
      `INSERT INTO customer_wallets (id, customer_id, balance, currency, wallet_code) VALUES (?, ?, 0, ?, ?)`,
      [id, customerId, ccy, walletCode]
    );
    return (await db.query('SELECT * FROM customer_wallets WHERE id = ?', [id])).rows[0];
  }

  async listCustomerWallets(customerId: string) {
    return (await db.query(
      'SELECT * FROM customer_wallets WHERE customer_id = ? ORDER BY currency',
      [customerId]
    )).rows;
  }

  async getOrCreateMerchantWallet(merchantId: string, currency: string = 'USD') {
    const ccy = this.normalizeCurrency(currency);
    const res = await db.query(
      'SELECT * FROM merchant_wallets WHERE merchant_id = ? AND currency = ?',
      [merchantId, ccy]
    );
    if (res.rows.length) return res.rows[0];
    const id = uuidv4();
    await db.query(
      `INSERT INTO merchant_wallets (id, merchant_id, balance, currency) VALUES (?, ?, 0, ?)`,
      [id, merchantId, ccy]
    );
    return (await db.query('SELECT * FROM merchant_wallets WHERE id = ?', [id])).rows[0];
  }

  async listMerchantWallets(merchantId: string) {
    return (await db.query(
      'SELECT * FROM merchant_wallets WHERE merchant_id = ? ORDER BY currency',
      [merchantId]
    )).rows;
  }

  async creditMerchantWallet(merchantId: string, amount: number, source: string, reference?: string, currency: string = 'USD') {
    const ccy = this.normalizeCurrency(currency);
    const wallet = await this.getOrCreateMerchantWallet(merchantId, ccy);
    const transactionId = uuidv4();
    const now = new Date().toISOString();

    await db.query(
      `UPDATE merchant_wallets SET balance = balance + ?, updated_at = ? WHERE id = ?`,
      [amount, now, wallet.id]
    );
    await db.query(
      `INSERT INTO merchant_wallet_transactions (id, wallet_id, type, amount, currency, source, reference, created_at)
       VALUES (?, ?, 'credit', ?, ?, ?, ?, ?)`,
      [transactionId, wallet.id, amount, ccy, source, reference || null, now]
    );
    let ledgerEntryId: string | null = null;
    try {
      const ledgerEntry = createLedgerEntry(transactionId, 'credit', amount, ccy, 'AUTHORIZED', `POS offline sale: ${reference || source || 'pos_offline'}`);
      validateTransition('PENDING', ledgerEntry.status as TransactionState);
      await persistLedgerEntry(ledgerEntry, db.query.bind(db));
      ledgerEntryId = ledgerEntry.id;
    } catch (err) {
      console.error('Failed to persist ledger entry for merchant credit', err);
    }
    return { success: true, transactionId, status: 'COMPLETED', ledgerEntryId, currency: ccy };
  }

  // ── Fiat wallet ops ──────────────────────────────────────────────────────────
  async topupWallet(customerId: string, amount: number, source: string, reference?: string, currency: string = 'USD') {
    const ccy = this.normalizeCurrency(currency);
    const wallet = await this.getOrCreateWallet(customerId, ccy);
    const transactionId = uuidv4();
    const ledgerEntry = createLedgerEntry(transactionId, 'credit', amount, ccy, 'AUTHORIZED', `Wallet topup via ${source || 'manual'}`);
    validateTransition('PENDING', ledgerEntry.status as TransactionState);

    await db.query(
      `UPDATE customer_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [amount, wallet.id]
    );
    await db.query(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, source, reference) VALUES (?, ?, 'credit', ?, ?, ?, ?)`,
      [transactionId, wallet.id, amount, ccy, source || 'manual', reference || null]
    );
    await persistLedgerEntry(ledgerEntry, db.query.bind(db));
    return { success: true, transactionId, status: ledgerEntry.status, currency: ccy };
  }

  private async authorizeCardTopup(amount: number, currency: string, cardNumber: string, expiry: string, cvv: string, emvData?: string) {
    const ccy = this.normalizeCurrency(currency);
    const sanitizedPan = (cardNumber || '').replace(/\D/g, '');
    const normalizedEmv = (emvData || '').trim();

    if (normalizedEmv) {
      try {
        const parsed = JSON.parse(normalizedEmv);
        const approved = parsed?.approved === true || parsed?.success === true || parsed?.status === 'approved' || parsed?.status === 'APPROVED';
        if (approved) {
          return {
            authCode: parsed?.authCode || parsed?.processorId || parsed?.authorizationCode || parsed?.id || `AUTH-${Date.now().toString(36).toUpperCase()}`,
            processorId: parsed?.processorId || parsed?.id || null,
            processor: parsed?.processor || 'PROVIDED',
            status: 'APPROVED',
          };
        }
        if (parsed?.message) {
          throw new Error(parsed.message);
        }
      } catch (parseError) {
        const trimmed = normalizedEmv.replace(/^['"]|['"]$/g, '');
        if (/^AUTH[-:_A-Z0-9]{3,}$/i.test(trimmed)) {
          return {
            authCode: trimmed,
            processorId: trimmed,
            processor: 'PROVIDED',
            status: 'APPROVED',
          };
        }
        if (trimmed) {
          throw new Error('Card authorization payload was invalid');
        }
      }
    }

    const processorUrl = process.env.CARD_PROCESSOR_URL?.trim() || process.env.CARD_PROCESSOR_AUTH_URL?.trim();
    if (!processorUrl) {
      throw new Error('Real card authorization is required');
    }

    const response = await axios.post(processorUrl, {
      amount,
      currency: ccy,
      cardNumber: sanitizedPan,
      expiry,
      cvv,
      panLast4: sanitizedPan.slice(-4),
      source: 'wallet_topup',
    }, { timeout: 5000 });

    const approved = response?.data?.approved === true || response?.data?.success === true || response?.data?.status?.toLowerCase() === 'approved';
    if (!approved) {
      throw new Error(response?.data?.message || 'Card authorization declined');
    }

    const authCode = response?.data?.authCode || response?.data?.authorizationCode || response?.data?.processorId || response?.data?.id || `AUTH-${Date.now().toString(36).toUpperCase()}`;
    const processor = response?.data?.processor || 'PROCESSOR';
    const isMock = /mock/i.test(authCode) || /mock/i.test(processor) || response?.data?.mock === true;
    if (isMock) {
      throw new Error('Real card authorization is required');
    }

    return {
      authCode,
      processorId: response?.data?.processorId || response?.data?.id || null,
      processor,
      status: 'APPROVED',
    };
  }

  async topupWalletWithCard(customerId: string, amount: number, cardNumber: string, panMasked?: string, expiry?: string, cvv?: string, emvData?: string, currency: string = 'USD') {
    const ccy = this.normalizeCurrency(currency);
    if (!customerId) throw new Error('customerId is required');
    if (amount <= 0) throw new Error('Amount must be positive');

    const sanitizedPan = (cardNumber || '').replace(/\D/g, '');
    if (!sanitizedPan || sanitizedPan.length < 13 || sanitizedPan.length > 19) {
      throw new Error('Enter a valid card number');
    }
    if (!expiry || !/^\d{2}\/\d{2}$/.test(expiry)) {
      throw new Error('Enter card expiry as MM/YY');
    }
    if (!cvv || !/^\d{3,4}$/.test(cvv)) {
      throw new Error('Enter a valid CVV');
    }

    const authorization = await this.authorizeCardTopup(amount, ccy, sanitizedPan, expiry, cvv, emvData);

    const wallet = await this.getOrCreateWallet(customerId, ccy);
    await db.query(
      `UPDATE customer_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [amount, wallet.id]
    );

    const txnId = uuidv4();
    const maskedPan = panMasked || (cardNumber ? cardNumber.slice(-4) : 'N/A');

    await db.query(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, source, pan_masked, emv_data, reference) VALUES (?, ?, 'credit', ?, ?, 'card_topup', ?, ?, ?)`,
      [txnId, wallet.id, amount, ccy, maskedPan, emvData || null, authorization.authCode]
    );

    return {
      success: true,
      transactionId: txnId,
      authCode: authorization.authCode,
      processorId: authorization.processorId,
      processor: authorization.processor,
      walletId: wallet.id,
      expiry,
      cvv,
      currency: ccy,
    };
  }

  async debitWallet(customerId: string, amount: number, source: string, reference?: string, currency: string = 'AED') {
    const ccy = this.normalizeCurrency(currency);
    const wallet = await this.getOrCreateWallet(customerId, ccy);
    const balanceRes = await db.query('SELECT balance FROM customer_wallets WHERE id = ?', [wallet.id]);
    const balance = Number(balanceRes.rows[0]?.balance ?? 0);
    if (balance < amount) throw new Error(`Insufficient ${ccy} balance`);

    const transactionId = uuidv4();
    const ledgerEntry = createLedgerEntry(transactionId, 'debit', amount, ccy, 'AUTHORIZED', `Wallet debit via ${source || 'pos_offline'}`);
    validateTransition('PENDING', ledgerEntry.status as TransactionState);

    await db.query(
      `UPDATE customer_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [amount, wallet.id]
    );
    await db.query(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, source, reference) VALUES (?, ?, 'debit', ?, ?, ?, ?)`,
      [transactionId, wallet.id, amount, ccy, source || 'pos_offline', reference || null]
    );
    await persistLedgerEntry(ledgerEntry, db.query.bind(db));
    return { success: true, transactionId, status: ledgerEntry.status, currency: ccy };
  }

  async getWalletBalance(customerId: string, currency?: string) {
    const ccy = currency ? this.normalizeCurrency(currency) : null;
    const res = ccy
      ? await db.query('SELECT balance, currency FROM customer_wallets WHERE customer_id = ? AND currency = ?', [customerId, ccy])
      // No currency: prefer AED, then any existing wallet
      : await db.query(`SELECT balance, currency FROM customer_wallets WHERE customer_id = ?
         ORDER BY CASE WHEN currency='AED' THEN 0 ELSE 1 END, created_at ASC LIMIT 1`, [customerId]);
    if (res.rows.length) return res.rows[0];
    // No wallet at all — create default AED wallet
    await this.getOrCreateWallet(customerId, 'AED');
    return { balance: 0, currency: 'AED' };
  }

  async getWalletTransactions(customerId: string, currency?: string) {
    const walletRes = currency
      ? await db.query('SELECT id FROM customer_wallets WHERE customer_id = ? AND currency = ?', [customerId, this.normalizeCurrency(currency)])
      : await db.query('SELECT id FROM customer_wallets WHERE customer_id = ?', [customerId]);
    if (!walletRes.rows.length) return [];
    const walletIds = walletRes.rows.map((r: any) => r.id);
    const placeholders = walletIds.map(() => '?').join(',');
    return (await db.query(
      `SELECT * FROM wallet_transactions WHERE wallet_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 100`,
      walletIds
    )).rows;
  }

  // ── Customers ────────────────────────────────────────────────────────────────
  async getCustomers() {
    // Use subquery to get only one wallet per customer — prefer AED, fallback to first created
    return (await db.query(`
      SELECT
        c.id, c.name, c.email, c.phone, c.created_at, c.updated_at,
        w.id AS wallet_id,
        w.wallet_code,
        w.balance AS wallet_balance,
        w.currency AS wallet_currency
      FROM customers c
      LEFT JOIN customer_wallets w ON w.id = (
        SELECT id FROM customer_wallets
        WHERE customer_id = c.id
        ORDER BY CASE WHEN currency = 'AED' THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1
      )
      ORDER BY c.created_at DESC
    `)).rows;
  }

  async createCustomer(name: string, email?: string, phone?: string) {
    const trimmedName = (name || '').trim();
    if (!trimmedName) throw new Error('Customer name is required');
    if (trimmedName.length < 2) throw new Error('Customer name must be at least 2 characters');
    if (trimmedName.length > 120) throw new Error('Customer name too long (max 120 chars)');

    const safeEmail = email && email.trim() ? email.trim() : null;
    const safePhone = phone && phone.trim() ? phone.trim() : null;

    const id = uuidv4();
    await db.query(
      'INSERT INTO customers (id, name, email, phone) VALUES (?, ?, ?, ?)',
      [id, trimmedName, safeEmail, safePhone]
    );
    const wallet = await this.getOrCreateWallet(id);
    const rows = (await db.query(
      'SELECT id, name, email, phone, created_at, updated_at FROM customers WHERE id = ?',
      [id]
    )).rows;
    const customer = rows[0];
    if (!customer) throw new Error('Customer record not found after insert — DB integrity failure');
    if (!customer.name) throw new Error('Customer name failed to persist — DB write verification failed');
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
      wallet_id: wallet.id,
      wallet_code: wallet.wallet_code,
      wallet_balance: wallet.balance
    };
  }

  // ── Wallet-to-Wallet Transfer ─────────────────────────────────────────────
  async walletTransfer(senderCustomerId: string, receiverCustomerId: string, amount: number, note?: string, currency: string = 'USD') {
    const ccy = this.normalizeCurrency(currency);
    if (senderCustomerId === receiverCustomerId) throw new Error('Cannot transfer to yourself');
    if (amount <= 0) throw new Error('Amount must be positive');

    const sender = await this.getOrCreateWallet(senderCustomerId, ccy);
    const receiver = await this.getOrCreateWallet(receiverCustomerId, ccy);

    const balRes = await db.query('SELECT balance FROM customer_wallets WHERE id = ?', [sender.id]);
    const balance = Number(balRes.rows[0]?.balance ?? 0);
    if (balance < amount) throw new Error(`Insufficient ${ccy} balance`);

    const transferId = uuidv4();
    const ref = `TRF-${transferId.slice(0, 8).toUpperCase()}`;

    // Debit sender
    await db.query('UPDATE customer_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, sender.id]);
    await db.query(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, source, reference, description) VALUES (?, ?, 'debit', ?, ?, 'wallet_transfer', ?, ?)`,
      [uuidv4(), sender.id, amount, ccy, ref, `Transfer to ${receiverCustomerId}`]
    );

    // Credit receiver
    await db.query('UPDATE customer_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, receiver.id]);
    await db.query(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, source, reference, description) VALUES (?, ?, 'credit', ?, ?, 'wallet_transfer', ?, ?)`,
      [uuidv4(), receiver.id, amount, ccy, ref, `Transfer from ${senderCustomerId}`]
    );

    // Record transfer
    await db.query(
      `INSERT INTO wallet_transfers (id, sender_customer_id, receiver_customer_id, amount, currency, note, status, fee) VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', 0)`,
      [transferId, senderCustomerId, receiverCustomerId, amount, ccy, note || null]
    );

    return { success: true, transferId, reference: ref, amount, currency: ccy };
  }

  // ── Bank accounts ─────────────────────────────────────────────────────────
  async addBankAccount(customerId: string, bankData: {
    bankName: string; accountHolder: string; accountNumber: string;
    routingNumber?: string; iban?: string; swiftCode?: string; currency?: string;
  }) {
    const id = uuidv4();
    const ccy = this.normalizeCurrency(bankData.currency);
    await db.query(
      `INSERT INTO bank_accounts (id, customer_id, bank_name, account_holder, account_number, routing_number, iban, swift_code, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, customerId, bankData.bankName, bankData.accountHolder, bankData.accountNumber,
       bankData.routingNumber || null, bankData.iban || null, bankData.swiftCode || null, ccy]
    );
    return (await db.query('SELECT * FROM bank_accounts WHERE id = ?', [id])).rows[0];
  }

  async getBankAccounts(customerId: string) {
    return (await db.query('SELECT * FROM bank_accounts WHERE customer_id = ? ORDER BY created_at DESC', [customerId])).rows;
  }

  // ── Wallet-to-Bank payout ─────────────────────────────────────────────────
  async bankPayout(customerId: string, bankAccountId: string, amount: number, currency: string = 'USD') {
    const ccy = this.normalizeCurrency(currency);
    if (amount <= 0) throw new Error('Amount must be positive');

    const wallet = await this.getOrCreateWallet(customerId, ccy);
    const balRes = await db.query('SELECT balance FROM customer_wallets WHERE id = ?', [wallet.id]);
    const balance = Number(balRes.rows[0]?.balance ?? 0);

    const FEE_RATE = 0.005; // 0.5% fee
    const fee = Math.round(amount * FEE_RATE * 100) / 100;
    const netAmount = amount - fee;
    if (balance < amount) throw new Error(`Insufficient ${ccy} balance`);

    const bankRes = await db.query('SELECT * FROM bank_accounts WHERE id = ? AND customer_id = ?', [bankAccountId, customerId]);
    if (!bankRes.rows.length) throw new Error('Bank account not found');

    const payoutId = uuidv4();
    const ref = `PAY-${payoutId.slice(0, 8).toUpperCase()}`;

    // Debit wallet
    await db.query('UPDATE customer_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, wallet.id]);
    await db.query(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, source, reference, description) VALUES (?, ?, 'debit', ?, ?, 'bank_payout', ?, ?)`,
      [uuidv4(), wallet.id, amount, ccy, ref, `Bank payout to ${bankRes.rows[0].bank_name}`]
    );

    // Record payout (PENDING — real payout requires ACH/SEPA integration)
    await db.query(
      `INSERT INTO bank_payouts (id, customer_id, bank_account_id, amount, currency, fee, net_amount, status, reference, scheduled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, datetime('now', '+1 day'))`,
      [payoutId, customerId, bankAccountId, amount, ccy, fee, netAmount, ref]
    );

    return { success: true, payoutId, reference: ref, amount, fee, netAmount, status: 'PENDING', eta: '1-2 business days', currency: ccy };
  }

  async getBankPayouts(customerId: string) {
    return (await db.query(
      'SELECT p.*, b.bank_name, b.account_number FROM bank_payouts p JOIN bank_accounts b ON b.id = p.bank_account_id WHERE p.customer_id = ? ORDER BY p.created_at DESC LIMIT 50',
      [customerId]
    )).rows;
  }

  // ── Virtual Cards ─────────────────────────────────────────────────────────
  async generateCardCredentials(cardType: string = 'VISA') {
    const cardNumber = this.generateCardNumber(cardType);
    const masked = '*'.repeat(Math.max(0, cardNumber.length - 4)) + cardNumber.slice(-4);
    const now = new Date();
    const expiryMonth = now.getMonth() + 1;
    const expiryYear = now.getFullYear() + 3;
    const cvv = String(Math.floor(100 + Math.random() * 900));
    return { cardNumber, maskedNumber: masked, expiryMonth, expiryYear, cvv, cardType };
  }

  async issueVirtualCard(customerId: string, details: string | VirtualCardDetails, currency: string = 'USD') {
    const resolved = typeof details === 'string'
      ? { cardholderName: details, currency }
      : { ...details, currency: details.currency || currency };

    const generated = await this.generateCardCredentials(resolved.cardType || 'VISA');
    const cardNumber = resolved.cardNumber || generated.cardNumber;
    const masked = resolved.maskedNumber || generated.maskedNumber;
    const expiryMonth = Number(resolved.expiryMonth ?? generated.expiryMonth);
    const expiryYear = Number(resolved.expiryYear ?? generated.expiryYear);
    const cvv = String(resolved.cvv ?? generated.cvv);
    const cardholderName = resolved.cardholderName || 'Customer';
    const cardType = resolved.cardType || generated.cardType;
    const dailyLimit = Number(resolved.dailyLimit ?? 1000);

    const id = uuidv4();
    await db.query(
      `INSERT INTO virtual_cards (id, customer_id, card_number, masked_number, expiry_month, expiry_year, cvv, cardholder_name, card_type, status, balance, currency, daily_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?, ?)`,
      [id, customerId, cardNumber, masked, expiryMonth, expiryYear, cvv, cardholderName, cardType, currency, dailyLimit]
    );

    return {
      id, cardNumber, maskedNumber: masked,
      expiryMonth, expiryYear, cvv,
      cardholderName, cardType, status: 'ACTIVE',
      balance: 0, currency, dailyLimit
    };
  }

  async getVirtualCards(customerId: string) {
    const cards = (await db.query(
      'SELECT id, masked_number, expiry_month, expiry_year, cardholder_name, card_type, status, balance, currency, daily_limit, daily_spent, created_at FROM virtual_cards WHERE customer_id = ? ORDER BY created_at DESC',
      [customerId]
    )).rows;
    return cards;
  }

  async topupVirtualCard(customerId: string, cardId: string, amount: number, currency: string = 'USD') {
    const ccy = this.normalizeCurrency(currency);
    if (amount <= 0) throw new Error('Amount must be positive');
    const wallet = await this.getOrCreateWallet(customerId, ccy);
    const balRes = await db.query('SELECT balance FROM customer_wallets WHERE id = ?', [wallet.id]);
    if (Number(balRes.rows[0]?.balance ?? 0) < amount) throw new Error(`Insufficient ${ccy} wallet balance`);

    // Debit wallet, credit card
    await db.query('UPDATE customer_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, wallet.id]);
    await db.query('UPDATE virtual_cards SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND customer_id = ?', [amount, cardId, customerId]);
    await db.query(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, source, reference) VALUES (?, ?, 'debit', ?, ?, 'virtual_card_topup', ?)`,
      [uuidv4(), wallet.id, amount, ccy, cardId]
    );
    return { success: true, amount, currency: ccy };
  }

  async freezeVirtualCard(customerId: string, cardId: string) {
    await db.query("UPDATE virtual_cards SET status = 'FROZEN', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND customer_id = ?", [cardId, customerId]);
    return { success: true };
  }

  async unfreezeVirtualCard(customerId: string, cardId: string) {
    await db.query("UPDATE virtual_cards SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND customer_id = ?", [cardId, customerId]);
    return { success: true };
  }

  private generateCardNumber(cardType: string = 'VISA'): string {
    const prefix = cardType.toUpperCase().includes('MASTERCARD') ? '5' : '4';
    let num = prefix + Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
    // Luhn checksum
    let sum = 0;
    for (let i = 0; i < num.length; i++) {
      let d = parseInt(num[num.length - 1 - i]);
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    const check = (10 - (sum % 10)) % 10;
    return num + check;
  }

  // ── Crypto ────────────────────────────────────────────────────────────────
  async getCryptoPrice(cryptoCoin: string): Promise<number> {
    const coin = cryptoCoin.toUpperCase();

    // 1. Try Binance first (live keys configured)
    try {
      const { buyAssetWithUsd } = await import('../../exchange/binance.service');
      const symbol = coin === 'USDT' ? 'BTCUSDT' : `${coin}USDT`;
      const apiKey = process.env.BINANCE_API_KEY?.trim();
      const apiSecret = process.env.BINANCE_API_SECRET?.trim();
      const baseUrl = process.env.BINANCE_BASE_URL?.trim() || 'https://api.binance.com';

      if (apiKey && apiSecret && !apiKey.includes('your_')) {
        const res = await (await import('axios')).default.get(
          `${baseUrl}/api/v3/ticker/price?symbol=${symbol}`,
          { headers: { 'X-MBX-APIKEY': apiKey }, timeout: 5000 }
        );
        const price = parseFloat(res.data?.price ?? '0');
        if (price > 0) {
          if (coin === 'USDT') return 1.0;
          return price;
        }
      }
    } catch {
      // fall through to CoinGecko
    }

    // 2. CoinGecko fallback
    const coinMap: Record<string, string> = {
      BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether', SOL: 'solana',
      DOGE: 'dogecoin', BNB: 'binancecoin', XRP: 'ripple', ADA: 'cardano',
      AVAX: 'avalanche-2', DOT: 'polkadot', MATIC: 'matic-network', LINK: 'chainlink'
    };
    const id = coinMap[coin];
    if (id) {
      try {
        const res = await (await import('axios')).default.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
          { timeout: 5000 }
        );
        const price = res.data?.[id]?.usd;
        if (price) return price;
      } catch { /* ignore */ }
    }

    return this.getFallbackPrice(coin);
  }

  private getFallbackPrice(coin: string): number {
    const fallback: Record<string, number> = {
      BTC: 67000, ETH: 3400, USDT: 1.00, SOL: 145, DOGE: 0.12,
      BNB: 580, XRP: 0.55, ADA: 0.45, AVAX: 28, DOT: 6.5, MATIC: 0.7, LINK: 14
    };
    return fallback[coin.toUpperCase()] ?? 1;
  }

  async getOrCreateCryptoWallet(customerId: string, cryptoCoin: string) {
    const res = await db.query('SELECT * FROM customer_crypto_wallets WHERE customer_id = ? AND crypto_coin = ?', [customerId, cryptoCoin]);
    if (res.rows.length) return res.rows[0];
    const id = uuidv4();
    await db.query('INSERT INTO customer_crypto_wallets (id, customer_id, crypto_coin, balance) VALUES (?, ?, ?, 0)', [id, customerId, cryptoCoin]);
    return (await db.query('SELECT * FROM customer_crypto_wallets WHERE id = ?', [id])).rows[0];
  }

  async getCustomerCryptoWallets(customerId: string) {
    return (await db.query('SELECT * FROM customer_crypto_wallets WHERE customer_id = ? ORDER BY crypto_coin', [customerId])).rows;
  }

  async buyCryptoWithMerchant(merchantId: string, cryptoCoin: string, fiatAmount: number, network?: string) {
    const coin = cryptoCoin.toUpperCase();
    const merchantWallet = await this.getOrCreateMerchantWallet(merchantId);
    const balanceRes = await db.query('SELECT balance FROM merchant_wallets WHERE id = ?', [merchantWallet.id]);
    const balance = Number(balanceRes.rows[0]?.balance ?? 0);
    if (balance < fiatAmount) throw new Error(`Insufficient merchant wallet balance. Have $${balance}, need $${fiatAmount}`);

    // Get live price
    const exchangeRate = await this.getCryptoPrice(coin);
    let cryptoAmount = fiatAmount / exchangeRate;
    let binanceOrderId: string | null = null;
    let providerMode = 'internal';

    // Try live Binance buy
    try {
      const { buyAssetWithUsd } = await import('../../exchange/binance.service');
      const order = await buyAssetWithUsd(coin, fiatAmount);
      if (order && !order.mock) {
        const filled = order.fills?.[0];
        cryptoAmount = parseFloat(String(order.executedQty ?? cryptoAmount));
        binanceOrderId = String(order.order_id || '');
        providerMode = 'binance_live';
        console.log(`[Crypto] Binance order filled: ${cryptoAmount} ${coin} orderId=${binanceOrderId}`);
      }
    } catch (binErr: any) {
      console.warn(`[Crypto] Binance buy failed, using internal price: ${binErr?.message}`);
    }

    // Debit merchant fiat wallet
    await db.query(
      'UPDATE merchant_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [fiatAmount, merchantWallet.id]
    );
    await db.query(
      `INSERT INTO merchant_wallet_transactions (id, wallet_id, type, amount, source, reference) VALUES (?, ?, 'debit', ?, 'crypto_purchase', ?)`,
      [uuidv4(), merchantWallet.id, fiatAmount, binanceOrderId || uuidv4()]
    );

    // Credit merchant crypto balance
    const existingCrypto = await db.query(
      'SELECT id, amount FROM merchant_crypto_balances WHERE merchant_id = ? AND asset = ?',
      [merchantId, coin]
    );
    if (existingCrypto.rows.length > 0) {
      await db.query(
        'UPDATE merchant_crypto_balances SET amount = amount + ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ? AND asset = ?',
        [cryptoAmount, merchantId, coin]
      );
    } else {
      await db.query(
        'INSERT INTO merchant_crypto_balances (id, merchant_id, asset, amount, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [uuidv4(), merchantId, coin, cryptoAmount]
      );
    }

    // Record transaction
    await db.query(
      `INSERT INTO crypto_transactions (id, customer_id, crypto_coin, transaction_type, fiat_amount, crypto_amount, fiat_currency, exchange_rate, source, provider_mode, status)
       VALUES (?, ?, ?, 'buy', ?, ?, 'USD', ?, 'merchant_wallet', ?, 'completed')`,
      [uuidv4(), merchantId, coin, fiatAmount, cryptoAmount, exchangeRate, providerMode]
    );

    return {
      success: true,
      cryptoAmount,
      cryptoCoin: coin,
      exchangeRate,
      fiatAmount,
      merchantId,
      providerMode,
      binanceOrderId,
      network: network || 'primary',
      transactionId: binanceOrderId || uuidv4()
    };
  }

  async buyCryptoWithWallet(customerId: string, cryptoCoin: string, fiatAmount: number, network?: string, currency: string = 'USD') {
    const ccy = this.normalizeCurrency(currency);
    const cryptoWallet = await this.getOrCreateCryptoWallet(customerId, cryptoCoin);
    const exchangeRate = await this.getCryptoPrice(cryptoCoin);
    const cryptoAmount = fiatAmount / exchangeRate;

    const wallet = await this.getOrCreateWallet(customerId, ccy);
    const balRes = await db.query('SELECT balance FROM customer_wallets WHERE id = ?', [wallet.id]);
    if (Number(balRes.rows[0]?.balance ?? 0) < fiatAmount) throw new Error(`Insufficient ${ccy} wallet balance`);

    await db.query('UPDATE customer_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [fiatAmount, wallet.id]);
    await db.query(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, source, reference, description) VALUES (?, ?, 'debit', ?, ?, 'crypto_purchase', ?, ?)`,
      [uuidv4(), wallet.id, fiatAmount, ccy, uuidv4(), `Bought ${cryptoAmount.toFixed(8)} ${cryptoCoin} @ $${exchangeRate}`]
    );
    await db.query('UPDATE customer_crypto_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [cryptoAmount, cryptoWallet.id]);
    await db.query(
      `INSERT INTO crypto_transactions (id, customer_id, crypto_coin, transaction_type, fiat_amount, crypto_amount, fiat_currency, exchange_rate, source, provider_mode, status)
       VALUES (?, ?, ?, 'buy', ?, ?, ?, ?, 'wallet_balance', ?, 'completed')`,
      [uuidv4(), customerId, cryptoCoin, fiatAmount, cryptoAmount, ccy, exchangeRate, network || 'primary']
    );

    return { success: true, cryptoAmount, exchangeRate, fiatAmount, network: network || 'primary', fiat_currency: ccy };
  }

  async sellCrypto(customerId: string, cryptoCoin: string, cryptoAmount: number, network?: string, currency: string = 'USD') {
    const ccy = this.normalizeCurrency(currency);
    const cryptoWallet = await this.getOrCreateCryptoWallet(customerId, cryptoCoin);
    if (Number(cryptoWallet.balance) < cryptoAmount) throw new Error('Insufficient crypto balance');

    const exchangeRate = await this.getCryptoPrice(cryptoCoin);
    const fiatAmount = cryptoAmount * exchangeRate;
    const wallet = await this.getOrCreateWallet(customerId, ccy);

    await db.query('UPDATE customer_crypto_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [cryptoAmount, cryptoWallet.id]);
    await db.query('UPDATE customer_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [fiatAmount, wallet.id]);
    await db.query(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, source, description) VALUES (?, ?, 'credit', ?, ?, 'crypto_sale', ?)`,
      [uuidv4(), wallet.id, fiatAmount, ccy, `Sold ${cryptoAmount} ${cryptoCoin} @ $${exchangeRate}`]
    );
    await db.query(
      `INSERT INTO crypto_transactions (id, customer_id, crypto_coin, transaction_type, fiat_amount, crypto_amount, fiat_currency, exchange_rate, source, provider_mode, status)
       VALUES (?, ?, ?, 'sell', ?, ?, ?, ?, 'crypto_wallet', ?, 'completed')`,
      [uuidv4(), customerId, cryptoCoin, fiatAmount, cryptoAmount, ccy, exchangeRate, network || 'primary']
    );

    return { success: true, fiatAmount, exchangeRate, cryptoAmount, network: network || 'primary', fiat_currency: ccy };
  }

  async getCryptoTransactions(customerId: string) {
    return (await db.query('SELECT * FROM crypto_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100', [customerId])).rows;
  }
}

export const walletsService = new WalletsService();
