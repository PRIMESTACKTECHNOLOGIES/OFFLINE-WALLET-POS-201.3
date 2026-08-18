#!/usr/bin/env node
/**
 * Transak Payment Processing - Example Usage & Test Cases
 * 
 * This file demonstrates how to use the implemented Transak payment processing
 * endpoints and includes test cases for development and CI/CD pipelines.
 */

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 1: Frontend - Initialize Transak Widget
// ─────────────────────────────────────────────────────────────────────────────

const FRONTEND_EXAMPLE_HTML = `
<!-- In your React/HTML page -->
<script type="text/javascript" src="https://global-stg.transak.com/index.js"></script>

<script>
async function initializeTransakWidget() {
  const userWallet = "0xc850e65151fA2f50636618d4688CF1A011AC04bF"; // User's ETH wallet
  const userEmail = "user@example.com";

  const transakConfig = {
    // API Settings
    apiKey: process.env.REACT_APP_TRANSAK_API_KEY,
    environment: 'staging',

    // Default transaction parameters
    defaultCryptoCurrency: 'ETH',
    defaultNetwork: 'ethereum',
    defaultFiatCurrency: 'GBP',
    defaultFiatAmount: 50,

    // User identification
    walletAddress: userWallet,
    email: userEmail,
    partnerCustomerId: 'customer-123', // Your internal customer ID

    // Payment options
    productsAvailed: 'BUY', // Only allow buying (not selling)
    cryptoCurrencyList: 'ETH,BTC,USDT',

    // Callbacks
    onSuccess: async (requestId) => {
      console.log('✓ User completed payment entry, requestId:', requestId);

      try {
        // Send requestId to backend to create the order
        const response = await fetch('/api/payments/transak/create-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_JWT_TOKEN' // If auth required
          },
          body: JSON.stringify({
            requestId: requestId,
            userIp: undefined // Will auto-detect from request
          })
        });

        if (!response.ok) {
          throw new Error('Failed to create order');
        }

        const { orderId, order } = await response.json();
        console.log('✓ Order created:', orderId);
        console.log('  Status:', order.status);
        console.log('  Fiat:', order.fiatAmount, order.fiatCurrency);
        console.log('  Crypto:', order.cryptoAmount, order.cryptoCurrency);

        // Poll order status
        pollOrderStatus(orderId);

        // Or subscribe to WebSocket for real-time updates
        subscribeToOrderUpdates(orderId);

      } catch (error) {
        console.error('✗ Failed to create order:', error);
      }
    },

    onFail: (error) => {
      console.error('✗ Widget error:', error);
    },

    onCancel: () => {
      console.log('⊘ Widget closed by user');
    }
  };

  // Render widget
  new Transak.Widget(transakConfig).show();
}

// Poll order status every 5 seconds
async function pollOrderStatus(orderId, maxAttempts = 60) {
  let attempts = 0;

  const checkStatus = async () => {
    try {
      const response = await fetch(\`/api/payments/transak/order/\${orderId}\`);
      const { order } = await response.json();

      console.log('Order status:', order.status);

      if (order.status === 'PAYMENT_COMPLETED') {
        console.log('✓ Payment completed!');
        console.log('  Crypto received:', order.cryptoAmount, order.cryptoCurrency);
        console.log('  Tx hash:', order.transactionHash);
        showSuccessMessage('Crypto purchased successfully');
        return;
      }

      if (order.status === 'FAILED' || order.status === 'EXPIRED') {
        console.error('✗ Payment failed or expired');
        showErrorMessage('Payment failed. Please try again.');
        return;
      }

      if (attempts < maxAttempts) {
        attempts++;
        setTimeout(checkStatus, 5000);
      } else {
        console.warn('⊘ Order status check timed out');
      }

    } catch (error) {
      console.error('✗ Status check failed:', error);
    }
  };

  checkStatus();
}

// Subscribe to real-time updates via WebSocket
function subscribeToOrderUpdates(orderId) {
  const ws = new WebSocket(\`wss://yourapp.com/ws\`);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'subscribe',
      channel: \`transak_order:\${orderId}\`
    }));
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'transak.order.update') {
      console.log('✓ Real-time update:', message.data);
    }
  };
}
</script>
`;

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 2: Backend - Direct API Usage
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_EXAMPLE_JS = `
import { createOrder, getOrderStatus } from './backend/src/exchange/transak.service';

// Example: Create an order
async function exampleCreateOrder() {
  try {
    const result = await createOrder(
      { requestId: 'user-widget-request-123' },
      { userIp: '192.168.1.100' }
    );

    if (result.success) {
      console.log('✓ Order created:', result.orderId);
      console.log('  Status:', result.order.status);
      console.log('  Amount:', result.order.fiatAmount, result.order.fiatCurrency);
    } else {
      console.error('✗ Order creation failed:', result.error);
    }
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

// Example: Check order status
async function exampleGetOrderStatus() {
  try {
    const order = await getOrderStatus('86be4fec-aaff-4734-a8d5-ef757b04a75a');
    console.log('Order status:', order.status);
    console.log('Amount paid:', order.amountPaid);
    console.log('Tx hash:', order.transactionHash);
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 3: cURL - Test Endpoints Directly
// ─────────────────────────────────────────────────────────────────────────────

const CURL_EXAMPLES = `
# Test 1: Create an order
curl -X POST http://localhost:7088/payments/transak/create-order \\
  -H "Content-Type: application/json" \\
  -d '{
    "requestId": "test-request-abc123",
    "userIp": "203.0.113.1"
  }'

# Expected Response (201 Created):
# {
#   "success": true,
#   "orderId": "86be4fec-aaff-4734-a8d5-ef757b04a75a",
#   "status": "AWAITING_PAYMENT_FROM_USER",
#   "order": {
#     "orderId": "86be4fec-aaff-4734-a8d5-ef757b04a75a",
#     "status": "AWAITING_PAYMENT_FROM_USER",
#     "fiatCurrency": "GBP",
#     "fiatAmount": 50,
#     "cryptoCurrency": "ETH",
#     "cryptoAmount": 0.02976623,
#     "network": "ethereum",
#     "walletAddress": "0x...",
#     "conversionPrice": 0.0006233766403249686,
#     "totalFeeInFiat": 2.25
#   }
# }

---

# Test 2: Get order status
curl http://localhost:7088/payments/transak/order/86be4fec-aaff-4734-a8d5-ef757b04a75a

# Expected Response (200 OK):
# {
#   "success": true,
#   "order": {
#     "orderId": "86be4fec-aaff-4734-a8d5-ef757b04a75a",
#     "status": "PAYMENT_IN_PROGRESS",
#     "fiatCurrency": "GBP",
#     "fiatAmount": 50,
#     "cryptoCurrency": "ETH",
#     "cryptoAmount": 0.02976623,
#     "network": "ethereum",
#     "walletAddress": "0x...",
#     "transactionHash": "0x1234567890abcdef...",
#     "amountPaid": 50,
#     "conversionPrice": 0.0006233766403249686,
#     "totalFeeInFiat": 2.25
#   }
# }

---

# Test 3: Webhook (with HMAC signature)
# First, generate the HMAC-SHA256 signature:
# signature = hex(HMAC-SHA256(webhook_payload, webhook_secret))

PAYLOAD='{"data":{"orderId":"86be4fec-aaff-4734-a8d5-ef757b04a75a","status":"PAYMENT_COMPLETED"}}'
SIGNATURE=\$(echo -n "\$PAYLOAD" | openssl dgst -sha256 -hmac "your_webhook_secret" | cut -d' ' -f2)

curl -X POST http://localhost:7088/payments/transak/webhook \\
  -H "Content-Type: application/json" \\
  -H "x-signature: \$SIGNATURE" \\
  -d "\$PAYLOAD"

# Expected Response (200 OK):
# {
#   "success": true,
#   "received": true
# }
`;

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 4: TypeScript - Service Integration
// ─────────────────────────────────────────────────────────────────────────────

const TS_INTEGRATION_EXAMPLE = `
import { createOrder, getOrderStatus, verifyWebhookSignature } from './transak.service';
import { Request, Response } from 'express';

export class TransakOrderService {
  /**
   * Create a new Transak order from widget request
   */
  async processWidgetCallback(requestId: string, userIp: string) {
    const result = await createOrder(
      { requestId },
      { userIp }
    );

    if (!result.success) {
      throw new Error(\`Order creation failed: \${result.error}\`);
    }

    // Store in database
    await db.query(
      'INSERT INTO transak_orders (order_id, request_id, status, fiat_currency, fiat_amount, crypto_currency, crypto_amount, network, wallet_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        result.orderId,
        requestId,
        result.order.status,
        result.order.fiatCurrency,
        result.order.fiatAmount,
        result.order.cryptoCurrency,
        result.order.cryptoAmount,
        result.order.network,
        result.order.walletAddress
      ]
    );

    return result;
  }

  /**
   * Poll order status and update database
   */
  async syncOrderStatus(orderId: string) {
    const order = await getOrderStatus(orderId);

    await db.query(
      'UPDATE transak_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?',
      [order.status, orderId]
    );

    return order;
  }

  /**
   * Handle webhook notification
   */
  async handleWebhook(req: Request, res: Response) {
    const signature = req.headers['x-signature'] as string;
    const rawBody = req.rawBody;

    // Verify signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    const orderId = event.data?.orderId;

    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

    // Update database
    await db.query(
      'UPDATE transak_orders SET status = ?, raw_event = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?',
      [event.data.status, JSON.stringify(event), orderId]
    );

    // Emit real-time update
    const io = getWsServer();
    io.emit('transak.order.update', {
      orderId,
      status: event.data.status,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true, received: true });
  }
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE 5: Testing - Jest/Mocha Test Suite
// ─────────────────────────────────────────────────────────────────────────────

const TEST_SUITE_EXAMPLE = `
import request from 'supertest';
import { app } from '../app';
import { db } from '../config/db';

describe('Transak Payment Processing', () => {
  beforeEach(async () => {
    // Clear test data
    await db.query('DELETE FROM transak_orders');
  });

  describe('POST /payments/transak/create-order', () => {
    it('should create an order with valid requestId', async () => {
      const response = await request(app)
        .post('/payments/transak/create-order')
        .send({
          requestId: 'test-request-123',
          userIp: '127.0.0.1'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.orderId).toBeDefined();
      expect(response.body.order.status).toBe('AWAITING_PAYMENT_FROM_USER');
    });

    it('should reject without requestId', async () => {
      const response = await request(app)
        .post('/payments/transak/create-order')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('requestId');
    });

    it('should store order in database', async () => {
      const response = await request(app)
        .post('/payments/transak/create-order')
        .send({ requestId: 'test-request-123' });

      const orderId = response.body.orderId;
      const rows = await db.query(
        'SELECT * FROM transak_orders WHERE order_id = ?',
        [orderId]
      );

      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].order_id).toBe(orderId);
      expect(rows.rows[0].request_id).toBe('test-request-123');
    });
  });

  describe('GET /payments/transak/order/:orderId', () => {
    it('should return order status', async () => {
      // First create an order
      const createRes = await request(app)
        .post('/payments/transak/create-order')
        .send({ requestId: 'test-request-123' });

      const orderId = createRes.body.orderId;

      // Then get its status
      const response = await request(app)
        .get(\`/payments/transak/order/\${orderId}\`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order.orderId).toBe(orderId);
    });
  });

  describe('POST /payments/transak/webhook', () => {
    it('should reject invalid signature', async () => {
      const response = await request(app)
        .post('/payments/transak/webhook')
        .set('x-signature', 'invalid')
        .send({
          data: {
            orderId: 'test-order-123',
            status: 'PAYMENT_COMPLETED'
          }
        });

      expect(response.status).toBe(401);
    });

    it('should update order on valid webhook', async () => {
      // This would require generating a valid HMAC signature
      // Implementation depends on your test setup
      const orderId = 'test-order-123';
      const payload = { data: { orderId, status: 'PAYMENT_COMPLETED' } };
      const signature = generateHmac(payload, process.env.TRANSAK_WEBHOOK_SECRET);

      const response = await request(app)
        .post('/payments/transak/webhook')
        .set('x-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });
  });
});
`;

// Export all examples
console.log('='.repeat(80));
console.log('TRANSAK PAYMENT PROCESSING - EXAMPLES & TEST CASES');
console.log('='.repeat(80));
console.log();
console.log('See TRANSAK_INTEGRATION.md for complete documentation');
console.log('See TRANSAK_SETUP.md for quick setup instructions');
console.log();
console.log('The following examples are available:');
console.log('1. Frontend - Initialize Transak Widget');
console.log('2. Backend - Service Integration');
console.log('3. cURL - Direct API Testing');
console.log('4. TypeScript - Full Integration Example');
console.log('5. Testing - Jest/Mocha Test Suite');
console.log();

export {
  FRONTEND_EXAMPLE_HTML,
  BACKEND_EXAMPLE_JS,
  CURL_EXAMPLES,
  TS_INTEGRATION_EXAMPLE,
  TEST_SUITE_EXAMPLE
};
