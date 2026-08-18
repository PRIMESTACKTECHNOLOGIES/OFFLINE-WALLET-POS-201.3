# Transak Payment Processing - Quick Setup Guide

## Summary of Changes

This implementation adds complete Transak payment processing support to the POS backend, enabling users to purchase cryptocurrency via Google Pay and other payment methods.

### Files Modified/Created

#### Service Layer
- **`backend/src/exchange/transak.service.ts`**
  - Added `createOrder()` function to create orders via Google Pay
  - Added `CreateOrderRequest` and `CreateOrderResponse` interfaces
  - Supports access token generation, configuration management, and webhook verification

#### Controller Layer
- **`backend/src/domain/payments/payments.controller.ts`**
  - Added `createTransakOrder()` - Creates new crypto purchase order
  - Added `getTransakOrderStatus()` - Checks order status
  - Added `handleTransakWebhook()` - Processes webhook notifications
  - Added database import for persistence

#### Router Layer
- **`backend/src/domain/payments/payments.router.ts`**
  - Added `POST /payments/transak/create-order` - Create order endpoint
  - Added `GET /payments/transak/order/:orderId` - Status check endpoint
  - Added `POST /payments/transak/webhook` - Webhook handler endpoint

#### Database
- **`backend/src/domain/setup/init_tables.ts`**
  - Added `transak_orders` table creation (auto-created on app start)

#### Database Migration
- **`backend/db/migrations/init_transak_orders.sql`**
  - SQL migration file with table schema and indexes

#### Documentation
- **`TRANSAK_INTEGRATION.md`** - Complete integration guide
- **`TRANSAK_SETUP.md`** - This file

## Quick Start

### 1. Get Transak API Credentials

1. Go to [Transak Dashboard](https://dashboard.transak.com)
2. Sign up / Log in
3. Navigate to **Settings → API Keys**
4. Copy your **API Key** and **API Secret**
5. Note the **Webhook Secret** for signature verification

### 2. Configure Environment Variables

Add to `.env` file in `backend/` directory:

```env
TRANSAK_MODE=staging
TRANSAK_API_KEY=your_api_key_here
TRANSAK_API_SECRET=your_api_secret_here
TRANSAK_REFERRER_DOMAIN=yourapp.com
TRANSAK_WEBHOOK_SECRET=your_webhook_secret_here
```

**For production**, change to:
```env
TRANSAK_MODE=production
```

### 3. Build and Start Backend

```bash
cd backend
npm install
npm run build
npm start
```

The `transak_orders` table will be automatically created on startup.

### 4. Test the Endpoint

```bash
# Test creating an order (use any requestId for testing)
curl -X POST http://localhost:7088/payments/transak/create-order \
  -H "Content-Type: application/json" \
  -d '{"requestId": "test-123", "userIp": "127.0.0.1"}'
```

Expected response:
```json
{
  "success": true,
  "orderId": "86be4fec-aaff-4734-a8d5-ef757b04a75a",
  "status": "AWAITING_PAYMENT_FROM_USER",
  "order": { ... }
}
```

### 5. Configure Webhook in Transak Dashboard

1. Log in to [Transak Dashboard](https://dashboard.transak.com)
2. Go to **Settings → Webhooks**
3. Set webhook URL: `https://yourapp.com/payments/transak/webhook`
4. Copy the **Webhook Secret** to `TRANSAK_WEBHOOK_SECRET` in `.env`

## API Endpoints

All endpoints require JSON and return JSON.

### Create Order
```
POST /payments/transak/create-order
Content-Type: application/json

{
  "requestId": "string (from Transak widget)",
  "userIp": "string (optional)"
}

Response: 201 Created
{
  "success": true,
  "orderId": "string",
  "status": "AWAITING_PAYMENT_FROM_USER",
  "order": { ... }
}
```

### Get Order Status
```
GET /payments/transak/order/{orderId}

Response: 200 OK
{
  "success": true,
  "order": { ... }
}
```

### Webhook (Auto-handled by backend)
```
POST /payments/transak/webhook
X-Signature: [HMAC-SHA256 hash]

{
  "data": {
    "orderId": "string",
    "status": "string",
    ...
  }
}

Response: 200 OK
{
  "success": true,
  "received": true
}
```

## Frontend Integration

### 1. Add Transak Widget Script

```html
<script type="text/javascript" src="https://global-stg.transak.com/index.js"></script>
```

### 2. Initialize Widget

```javascript
const transakConfig = {
  apiKey: 'YOUR_API_KEY',
  environment: 'staging',
  defaultCryptoCurrency: 'ETH',
  defaultNetwork: 'ethereum',
  defaultFiatCurrency: 'GBP',
  walletAddress: userWalletAddress,
  email: userEmail,
  onSuccess: (requestId) => {
    // Send requestId to backend
    fetch('/api/payments/transak/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId })
    })
    .then(r => r.json())
    .then(data => {
      console.log('Order created:', data.orderId);
    });
  }
};

Transak.init(transakConfig);
```

## Database Schema

### transak_orders Table

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-increment primary key |
| order_id | TEXT | Transak's unique order ID |
| request_id | TEXT | Request ID from widget callback |
| status | TEXT | Order status (AWAITING_PAYMENT_FROM_USER, etc.) |
| fiat_currency | TEXT | Currency code (GBP, USD, EUR) |
| fiat_amount | REAL | Amount in fiat currency |
| crypto_currency | TEXT | Crypto asset (ETH, BTC, USDT) |
| crypto_amount | REAL | Amount in cryptocurrency |
| network | TEXT | Blockchain network (ethereum, bsc, tron) |
| wallet_address | TEXT | Destination wallet address |
| transaction_hash | TEXT | On-chain transaction hash |
| amount_paid | REAL | Actual amount paid |
| conversion_price | REAL | Fiat per crypto unit |
| total_fee | REAL | Fee in fiat currency |
| raw_event | TEXT | Full webhook payload (JSON) |
| created_at | TEXT | Order creation timestamp |
| updated_at | TEXT | Last update timestamp |

## Testing Checklist

- [ ] Backend builds without errors
- [ ] `.env` contains TRANSAK_API_KEY and TRANSAK_API_SECRET
- [ ] Backend starts successfully
- [ ] `transak_orders` table exists in database
- [ ] POST /payments/transak/create-order returns 201
- [ ] GET /payments/transak/order/:orderId returns order data
- [ ] Frontend widget loads correctly
- [ ] Widget onSuccess callback fires with requestId
- [ ] Order is stored in transak_orders table

## Troubleshooting

### "Transak API keys not configured"
- Verify TRANSAK_API_KEY and TRANSAK_API_SECRET are set in `.env`
- Restart backend after editing `.env`

### Webhook signature verification failed
- Verify TRANSAK_WEBHOOK_SECRET matches the value in Transak dashboard
- Check that webhook is being sent from Transak servers

### Order not found
- Verify orderId from POST response
- Check database: `SELECT * FROM transak_orders WHERE order_id = '...'`

### Widget not loading
- Verify apiKey matches TRANSAK_API_KEY
- Check browser console for errors
- Ensure environment is correct (staging or production)

## Next Steps

1. **Testing**: Use staging environment to test payment flow
2. **Custom Fields**: Add merchant_id, customer_id tracking if needed
3. **Webhooks**: Implement real-time balance updates via WebSocket
4. **Reporting**: Add analytics for payment volume and conversion rates
5. **Production**: Switch to production credentials after thorough testing

## Support

For Transak API documentation:
- [Transak Docs](https://docs.transak.com)
- [API Reference](https://docs.transak.com/reference)
- [Webhook Events](https://docs.transak.com/webhooks)

For this implementation:
- Check TRANSAK_INTEGRATION.md for detailed documentation
- Review controller methods in payments.controller.ts
- Check Transak service functions in transak.service.ts
