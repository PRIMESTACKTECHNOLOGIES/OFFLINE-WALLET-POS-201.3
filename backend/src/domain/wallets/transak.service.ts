import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/db';
import { cryptoWalletsService } from './crypto-wallets.service';
import { walletsService } from './wallets.service';

export interface TransakOrder {
  id: string;
  customer_id: string;
  order_id: string;
  status: string;
  fiat_amount: number;
  fiat_currency: string;
  crypto_amount: number;
  crypto_currency: string;
  network: string;
  wallet_address: string;
  webhook_data?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Manages Transak fiat on-ramp integration for customers to buy crypto
 * Provides webhook receiver for order status updates
 */
export class TransakService {
  private apiUrl = process.env.TRANSAK_BASE_URL || 'https://api-gateway-stg.transak.com';
  private apiKey = process.env.TRANSAK_API_KEY || '';
  private apiSecret = process.env.TRANSAK_API_SECRET || '';
  private webhookSecret = process.env.TRANSAK_WEBHOOK_SECRET || '';
  private widgetUrl = process.env.TRANSAK_WIDGET_URL || 'https://global-stg.transak.com';
  private referrerDomain = process.env.TRANSAK_REFERRER_DOMAIN || 'localhost';

  /**
   * Generate Transak widget access token (for iframe embedding)
   */
  generateWidgetToken(customerId: string, orderId?: string): string {
    const payload = {
      apiKey: this.apiKey,
      customerId,
      orderId: orderId || uuidv4(),
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Sign the payload
    const signature = this.signPayload(JSON.stringify(payload));
    return Buffer.from(JSON.stringify({ ...payload, signature })).toString('base64');
  }

  /**
   * Get widget URL for embedding (for customer to buy crypto)
   */
  getWidgetUrl(customerId: string, cryptoCurrency: string = 'USDT', network: string = 'tron'): string {
    const params = new URLSearchParams({
      apiKey: this.apiKey,
      customerId,
      cryptoCurrency,
      network,
      referrerDomain: this.referrerDomain,
      themeColor: '6366f1', // Indigo
      redirectURL: `${process.env.FRONTEND_URL || 'http://localhost:7001'}/wallet?order=true`,
    });

    return `${this.widgetUrl}?${params.toString()}`;
  }

  /**
   * Create a Transak order programmatically (server-to-server)
   */
  async createOrder(
    customerId: string,
    fiatAmount: number,
    fiatCurrency: string,
    cryptoCurrency: string,
    network: string,
    walletAddress: string
  ): Promise<TransakOrder> {
    try {
      const orderId = uuidv4();
      const orderData = {
        id: orderId,
        partnerOrderId: orderId,
        fiatCurrency: fiatCurrency.toUpperCase(),
        fiatAmount,
        cryptoCurrency: cryptoCurrency.toUpperCase(),
        network: network.toLowerCase(),
        walletAddress,
        email: '', // Customer would provide via widget
        redirectURL: `${process.env.FRONTEND_URL || 'http://localhost:7001'}/wallet?order=${orderId}`,
      };

      // Call Transak API
      const response = await axios.post(`${this.apiUrl}/orders`, orderData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const transak_order_id = response.data?.id || orderId;

      // Store in DB
      const now = new Date().toISOString();
      await db.query(
        `INSERT INTO transak_orders_v2
         (id, customer_id, order_id, transak_order_id, status, fiat_amount, fiat_currency,
          crypto_amount, crypto_currency, network, wallet_address, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'PENDING', ?, ?, 0, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          customerId,
          orderId,
          transak_order_id,
          fiatAmount,
          fiatCurrency.toUpperCase(),
          cryptoCurrency.toUpperCase(),
          network.toLowerCase(),
          walletAddress,
          now,
          now,
        ]
      );

      return {
        id: orderId,
        customer_id: customerId,
        order_id: orderId,
        status: 'PENDING',
        fiat_amount: fiatAmount,
        fiat_currency: fiatCurrency.toUpperCase(),
        crypto_amount: 0,
        crypto_currency: cryptoCurrency.toUpperCase(),
        network: network.toLowerCase(),
        wallet_address: walletAddress,
        created_at: now,
        updated_at: now,
      };
    } catch (err) {
      console.error('Failed to create Transak order:', err);
      throw err;
    }
  }

  /**
   * Verify webhook signature (HMAC-SHA256)
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    try {
      const hmac = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(hmac)
      );
    } catch {
      return false;
    }
  }

  /**
   * Process Transak webhook event (order status update)
   */
  async handleWebhook(event: Record<string, any>): Promise<void> {
    try {
      const orderId = event.id || event.order_id || event.orderId;
      const status = event.status || event.eventName || 'UNKNOWN';
      const cryptoAmount = event.cryptoAmount || event.crypto_amount || 0;

      console.log(`[Transak] Webhook received: ${orderId} → ${status}`);

      // Find customer order
      const orderResult = await db.query(
        `SELECT * FROM transak_orders_v2 WHERE order_id = ? OR transak_order_id = ?`,
        [orderId, orderId]
      );

      if (!orderResult.rows || orderResult.rows.length === 0) {
        console.warn(`[Transak] Order not found: ${orderId}`);
        return;
      }

      const dbOrder = orderResult.rows[0];
      const customerId = dbOrder.customer_id;
      const now = new Date().toISOString();

      // Update order status
      await db.query(
        `UPDATE transak_orders_v2
         SET status = ?, crypto_amount = ?, webhook_data = ?, updated_at = ?
         WHERE id = ?`,
        [
          status,
          cryptoAmount,
          JSON.stringify(event),
          now,
          dbOrder.id,
        ]
      );

      // If order completed, credit customer crypto wallet
      if (status === 'COMPLETED' || status === 'COMPLETED' || status === 'PAID') {
        const txnId = await cryptoWalletsService.recordCryptoTransaction(
          customerId,
          dbOrder.crypto_currency,
          dbOrder.network,
          'buy',
          dbOrder.fiat_currency,
          dbOrder.crypto_currency,
          dbOrder.fiat_amount,
          cryptoAmount,
          cryptoAmount > 0 ? dbOrder.fiat_amount / cryptoAmount : 0,
          'transak',
          orderId
        );

        // Update crypto wallet balance
        const priceUsd = dbOrder.fiat_amount / (cryptoAmount || 1);
        await cryptoWalletsService.updateCryptoBalance(
          customerId,
          dbOrder.crypto_currency,
          dbOrder.network,
          event.walletAddress || event.wallet_address || '',
          cryptoAmount,
          priceUsd,
          'transak'
        );

        console.log(`[Transak] Credited ${cryptoAmount} ${dbOrder.crypto_currency} to ${customerId}`);
      }

      // Log webhook in audit trail
      await db.query(
        `INSERT INTO transak_webhook_log_v2
         (id, order_id, event_type, status, payload, processed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          orderId,
          event.eventName || status,
          'SUCCESS',
          JSON.stringify(event),
          now,
        ]
      );
    } catch (err) {
      console.error('[Transak] Webhook processing failed:', err);
      throw err;
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<Partial<TransakOrder>> {
    try {
      const result = await db.query(
        `SELECT * FROM transak_orders_v2 WHERE order_id = ? OR transak_order_id = ?`,
        [orderId, orderId]
      );

      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }

      return {};
    } catch (err) {
      console.error(`Failed to get order status for ${orderId}`, err);
      return {};
    }
  }

  /**
   * List customer orders
   */
  async listCustomerOrders(customerId: string, limit: number = 20): Promise<TransakOrder[]> {
    try {
      const result = await db.query(
        `SELECT * FROM transak_orders_v2
         WHERE customer_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [customerId, limit]
      );

      return result.rows as TransakOrder[];
    } catch (err) {
      console.error(`Failed to list orders for ${customerId}`, err);
      return [];
    }
  }

  /**
   * Sign payload (internal)
   */
  private signPayload(payload: string): string {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(payload)
      .digest('hex');
  }
}

export const transakService = new TransakService();
