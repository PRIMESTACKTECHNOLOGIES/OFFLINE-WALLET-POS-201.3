# Transak Payment Processing Integration

## Overview

This implementation adds support for processing crypto purchases through Transak's fiat on-ramp API, specifically integrating with Google Pay and other payment methods. Users can buy cryptocurrency using traditional payment methods (cards, bank transfers, etc.) and receive crypto directly to their wallet.

## Architecture

### Components

1. **Transak Service** (`backend/src/exchange/transak.service.ts`)
   - Handles all API communication with Transak
   - Manages access token generation and caching
   - Provides functions for creating orders, checking status, and webhook verification

2. **Payments Controller** (`backend/src/domain/payments/payments.controller.ts`)
   - Exposes REST endpoints for order creation and status checking
   - Handles webhook notifications from Transak
   - Persists order data to database

3. **Database Schema** (`backend/src/domain/setup/init_tables.ts`)
   - `transak_orders` table: Stores order details, status, and transaction data

### API Endpoints

#### Create Order
```
POST /payments/transak/create-order
```

**Request Body:**
```json
{
  "requestId": "string (required)",
  "userIp": "string (optional, defaults to request IP)"
}
```

The `requestId` is obtained from the Transak widget's `onSuccess` callback after the user completes payment details entry.

**Response (201 Created):**
```json
{
  "success": true,
  "orderId": "string",
  "status": "AWAITING_PAYMENT_FROM_USER",
  "order": {
    "orderId": "string",
    "status": "string",
    "fiatCurrency": "GBP",
    "fiatAmount": 50,
    "cryptoCurrency": "ETH",
    "cryptoAmount": 0.02976623,
    "network": "ethereum",
    "walletAddress": "0x...",
    "conversionPrice": 0.0006233766403249686,
    "totalFeeInFiat": 2.25,
    "statusHistories": []
  }
}
```

#### Get Order Status
```
GET /payments/transak/order/:orderId
```

**Response:**
```json
{
  "success": true,
  "order": {
    "orderId": "86be4fec-aaff-4734-a8d5-ef757b04a75a",
    "status": "PAYMENT_IN_PROGRESS",
    "fiatCurrency": "GBP",
    "fiatAmount": 50,
    "cryptoCurrency": "ETH",
    "cryptoAmount": 0.02976623,
    ...
  }
}
```

#### Webhook Handler
```
POST /payments/transak/webhook
```

Transak sends webhook notifications when order status changes. The endpoint:
- Verifies webhook signature using `x-signature` header
- Updates order status in database
- Broadcasts real-time updates via WebSocket (if available)

**Webhook Payload Example:**
```json
{
  "data": {
    "orderId": "86be4fec-aaff-4734-a8d5-ef757b04a75a",
    "status": "PAYMENT_COMPLETED",
    "fiatAmount": 50,
    "cryptoAmount": 0.02976623
  }
}
```

## Configuration

### Environment Variables

Add to `.env`:

```env
# Transak Configuration
TRANSAK_MODE=staging                  # 'staging' or 'production'
TRANSAK_API_KEY=your_api_key          # Partner API key from Transak dashboard
TRANSAK_API_SECRET=your_api_secret    # Partner API secret
TRANSAK_REFERRER_DOMAIN=yourapp.com   # Your domain
TRANSAK_WEBHOOK_SECRET=webhook_secret # For verifying webhook signatures (HMAC-SHA256)

# Optional: Override base URLs (defaults to staging/production endpoints)
TRANSAK_BASE_URL=https://api-gateway-stg.transak.com
TRANSAK_PUBLIC_API_URL=https://api-stg.transak.com
TRANSAK_WIDGET_URL=https://global-stg.transak.com
```

### Obtain Credentials

1. Visit [Transak Partner Dashboard](https://dashboard.transak.com)
2. Create an account and register your application
3. In Settings → API Keys, copy:
   - API Key (Public)
   - API Secret (Keep secure!)
4. Configure webhook URL in dashboard (e.g., `https://yourapp.com/payments/transak/webhook`)
5. Copy the Webhook Secret for HMAC verification

## Integration Flow

### 1. Frontend: Widget Integration

```javascript
// Initialize Transak widget
const transakConfig = {
  apiKey: 'YOUR_API_KEY',
  environment: 'staging',
  defaultCryptoCurrency: 'ETH',
  defaultNetwork: 'ethereum',
  defaultFiatCurrency: 'GBP',
  walletAddress: '0x...', // User's wallet
  email: 'user@example.com',
  onSuccess: (requestId) => {
    // User completed payment details
    // Send requestId to backend to create order
    fetch('/api/payments/transak/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId })
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        console.log('Order created:', data.orderId);
        // Poll or subscribe to order status updates
        pollOrderStatus(data.orderId);
      }
    });
  },
  onFail: (error) => {
    console.error('Transak widget error:', error);
  }
};

// Load and render widget
Transak.init(transakConfig);
```

### 2. Backend: Order Creation

When the frontend sends the `requestId`, the backend:
1. Calls `POST /api/v2/orders` on Transak API
2. Receives order details with status `AWAITING_PAYMENT_FROM_USER`
3. Stores order in `transak_orders` table
4. Returns order info to frontend

### 3. Payment Processing

- User completes payment in Transak's hosted flow
- Transak processes the payment (card, bank transfer, etc.)
- Order status transitions: `AWAITING_PAYMENT_FROM_USER` → `PAYMENT_IN_PROGRESS` → `PAYMENT_COMPLETED` or `FAILED`

### 4. Webhook Notifications

Transak sends POST to `/payments/transak/webhook` with:
- Order status updates
- Transaction hash (once on-chain)
- Crypto amount received

Backend:
- Verifies signature
- Updates database
- Emits WebSocket events for real-time updates

### 5. Frontend: Status Polling

```javascript
async function pollOrderStatus(orderId) {
  const maxAttempts = 60; // 5 minutes with 5-second intervals
  let attempts = 0;

  const checkStatus = async () => {
    const res = await fetch(`/api/payments/transak/order/${orderId}`);
    const { order } = await res.json();
    
    console.log('Order status:', order.status);
    
    if (order.status === 'PAYMENT_COMPLETED') {
      console.log('Crypto received:', order.cryptoAmount, order.cryptoCurrency);
      // Update UI, redirect, etc.
    } else if (order.status === 'FAILED') {
      console.error('Payment failed');
    } else if (attempts < maxAttempts) {
      attempts++;
      setTimeout(checkStatus, 5000);
    }
  };
  
  checkStatus();
}
```

## Database Schema

### transak_orders Table

```sql
CREATE TABLE transak_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL,        -- Transak's unique order ID
  request_id TEXT NOT NULL,              -- Request ID from widget callback
  status TEXT NOT NULL,                  -- AWAITING_PAYMENT_FROM_USER, PAYMENT_IN_PROGRESS, etc.
  
  fiat_currency TEXT NOT NULL,           -- GBP, USD, EUR, etc.
  fiat_amount REAL NOT NULL,             -- Amount in fiat
  
  crypto_currency TEXT NOT NULL,         -- ETH, BTC, USDT, etc.
  crypto_amount REAL NOT NULL,           -- Amount in crypto
  
  network TEXT,                          -- ethereum, bsc, tron, etc.
  wallet_address TEXT,                   -- Destination wallet address
  
  partner_order_id TEXT,                 -- Transak partner order reference
  partner_customer_id TEXT,              -- Transak partner customer ID
  
  transaction_hash TEXT,                 -- On-chain tx hash (after PAYMENT_COMPLETED)
  amount_paid REAL,                      -- Actual amount paid in fiat
  conversion_price REAL,                 -- Fiat per crypto unit
  total_fee REAL,                        -- Fee in fiat
  
  raw_event TEXT,                        -- Full webhook payload (JSON)
  created_at TEXT,                       -- Order creation time
  updated_at TEXT                        -- Last update time
);
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `requestId` missing | Widget callback didn't fire | Verify widget integration |
| 401 Unauthorized | Invalid API credentials | Check TRANSAK_API_KEY / TRANSAK_API_SECRET |
| Webhook signature failed | Webhook secret mismatch | Verify TRANSAK_WEBHOOK_SECRET matches dashboard |
| Order not found | Order hasn't been fetched before | Wait a moment and retry GET /transak/order/:orderId |

### Retry Logic

The `createOrder` function implements automatic error handling:
- Network timeouts: 15-second timeout
- API errors: Returns error message in response
- Invalid requests: Validates `requestId` format before calling API

## Testing

### Staging Environment

Use `TRANSAK_MODE=staging` for testing with mock data.

### Test Transactions

Transak staging environment supports test cards:
- Visa: `4111 1111 1111 1111` (any future date, any CVC)
- Mastercard: `5555 5555 5555 4444`

### Manual Testing

```bash
# Create order
curl -X POST http://localhost:7088/payments/transak/create-order \
  -H "Content-Type: application/json" \
  -d '{"requestId": "test-request-id", "userIp": "127.0.0.1"}'

# Get order status
curl http://localhost:7088/payments/transak/order/86be4fec-aaff-4734-a8d5-ef757b04a75a

# Test webhook (with proper signature)
curl -X POST http://localhost:7088/payments/transak/webhook \
  -H "Content-Type: application/json" \
  -H "x-signature: [HMAC-SHA256 signature]" \
  -d '{"data": {"orderId": "...", "status": "PAYMENT_COMPLETED"}}'
```

## Security Considerations

1. **API Keys**: Store TRANSAK_API_SECRET as environment variable, never in code
2. **Webhook Signature**: Always verify `x-signature` header using HMAC-SHA256
3. **User IP**: Track user's originating IP for fraud detection (sent in `x-user-ip` header)
4. **Rate Limiting**: Consider rate-limiting `/create-order` endpoint to prevent abuse
5. **CORS**: Restrict CORS origins to your frontend domain

## Monitoring & Logging

- Order creation attempts are logged to console
- Webhook processing logs verification results
- Database tracks all orders for audit trail
- WebSocket events broadcast real-time status updates

## Compliance

- Users must complete Transak's KYC (Know Your Customer) for amounts above limits
- Different countries have different limits and supported payment methods
- Check `getFiatCurrencies()` and `getCountries()` endpoints for supported regions

## Troubleshooting

### Webhook not being received

1. Verify webhook URL in Transak dashboard: `https://yourapp.com/payments/transak/webhook`
2. Check firewall/network allows inbound from Transak servers
3. Verify `TRANSAK_WEBHOOK_SECRET` matches dashboard setting
4. Check server logs for incoming POST requests

### Order status not updating

1. Verify database migration ran: Check `transak_orders` table exists
2. Check for errors in payment controller logs
3. For staging: Orders may not auto-complete; manually trigger via dashboard

### Widget integration issues

1. Verify `apiKey` matches TRANSAK_API_KEY
2. Verify `environment` matches TRANSAK_MODE (staging/production)
3. Check browser console for widget load errors
4. Ensure `walletAddress` is a valid blockchain address

## Future Enhancements

- [ ] Batch order status updates (poll multiple orders efficiently)
- [ ] Fiat conversion caching for better performance
- [ ] Support for SELL orders (off-ramp)
- [ ] Integration with merchant settlement flows
- [ ] Advanced KYC/AML reporting
- [ ] Multi-currency quote aggregation
