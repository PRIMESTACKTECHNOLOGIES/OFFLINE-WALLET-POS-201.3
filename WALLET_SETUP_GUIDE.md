# Professional Crypto Wallet System - Quick Start Guide

## 🚀 Getting Started

This guide helps you deploy and test the new professional crypto wallet system.

## Backend Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Database Initialization
The new crypto wallet tables are automatically created on backend startup:
- `customer_crypto_wallets_v2` - Customer holdings
- `crypto_wallet_transactions_v2` - Transaction log
- `transak_orders_v2` - Transak orders
- `transak_webhook_log_v2` - Webhook audit log
- `crypto_transactions_log_v2` - Transaction history

No manual migration needed! Tables are created in `src/domain/setup/init_tables.ts`

### 3. Environment Configuration
Verify these are set in `.env`:
```bash
# Transak Integration
TRANSAK_MODE=staging  # or production
TRANSAK_API_KEY=8406b787-c17c-4e16-a961-c69629d119f5
TRANSAK_API_SECRET=03XZL2ewtkGvY3Nk6kF4+w==
TRANSAK_BASE_URL=https://api-gateway-stg.transak.com
TRANSAK_WIDGET_URL=https://global-stg.transak.com
TRANSAK_WEBHOOK_SECRET=your-webhook-secret
TRANSAK_REFERRER_DOMAIN=localhost  # or your production domain
FRONTEND_URL=http://localhost:7001

# Price Feed
COINGECKO_API=https://api.coingecko.com/api/v3
```

### 4. Start Backend
```bash
npm run dev
# Server runs on http://localhost:7000
```

## Frontend Setup

### 1. Install Dependencies
```bash
cd client
npm install
```

### 2. Start Frontend
```bash
npm run dev
# App runs on http://localhost:7001
```

## Testing the Wallet System

### 1. Navigate to Wallet Page
- Login as a customer
- Click "💰 My Wallet" in navigation

### 2. View Wallet Balance
- See total balance (fiat + crypto)
- View portfolio breakdown pie chart
- Check USD wallet balance

### 3. Buy Crypto (Transak)
```bash
1. Click "Buy Crypto" button
2. Enter amount: $50 (minimum $10)
3. Select crypto: USDT
4. Select network: tron
5. Choose payment: "Pay with Transak"
6. Click "Continue"
7. Complete payment in Transak widget
8. Crypto automatically credited when payment completes
```

### 4. Test with Wallet Balance
```bash
1. First, ensure customer has USD balance in wallet
2. Click "Buy Crypto"
3. Select "Pay from Wallet" option
4. USD is immediately debited, crypto credited
5. Transaction appears in history
```

### 5. View Transaction History
- Scroll to "Recent Transactions"
- See all fiat and crypto transactions
- Status shows: PENDING, COMPLETED, FAILED

## API Endpoints

### Wallet Endpoints
```bash
# Get complete wallet snapshot
GET /api/crypto/wallets/:customerId/balance
Authorization: Bearer {token}

# Get crypto holdings list
GET /api/crypto/wallets/:customerId/crypto-holdings
Authorization: Bearer {token}

# Buy crypto
POST /api/crypto/wallets/:customerId/buy-crypto
Authorization: Bearer {token}
Body: {
  amount_usd: 100,
  crypto_currency: "USDT",
  network: "tron",
  payment_method: "transak"
}

# Swap crypto
POST /api/crypto/wallets/:customerId/swap
Authorization: Bearer {token}
Body: {
  from_coin: "USDT",
  from_network: "tron",
  to_coin: "BTC",
  to_network: "bitcoin",
  amount: 50
}

# Get transaction history
GET /api/crypto/wallets/:customerId/transaction-history?limit=10
Authorization: Bearer {token}
```

### Transak Endpoints
```bash
# Get widget token
GET /api/crypto/transak/widget-token/:customerId
Authorization: Bearer {token}

# List customer orders
GET /api/crypto/transak/orders/:customerId?limit=20
Authorization: Bearer {token}

# Webhook receiver (Transak calls this)
POST /webhooks/transak
Headers: {
  "x-transak-signature": "hmac-sha256-signature"
}
```

## Troubleshooting

### Issue: Crypto holdings not showing
**Solution:** Check if customer has made a purchase via Transak or wallet_balance
- View database: `SELECT * FROM customer_crypto_wallets_v2 WHERE customer_id = ?`

### Issue: Transak widget not opening
**Solution:** Verify Transak configuration in backend
```bash
echo $TRANSAK_API_KEY  # Should not be empty
echo $TRANSAK_WIDGET_URL  # Should be valid URL
```

### Issue: Webhook not processing orders
**Solution:** Verify webhook secret and check logs
```bash
# Check if webhook was received
SELECT * FROM transak_webhook_log_v2 ORDER BY processed_at DESC LIMIT 5

# Check order status
SELECT * FROM transak_orders_v2 WHERE customer_id = ? ORDER BY created_at DESC
```

### Issue: Prices not updating
**Solution:** CoinGecko API is rate-limited; add caching
- Current implementation calls CoinGecko per request
- Recommend: Cache prices in Redis for 1-5 minutes

## Architecture Diagram

```
┌─────────────────────┐
│   React Frontend    │
│  (WalletsPage.tsx)  │
└──────────┬──────────┘
           │
    ┌──────▼──────────┐
    │  API Routes     │
    │ (/api/crypto)   │
    └──────┬──────────┘
           │
    ┌──────▼─────────────────────┐
    │  Service Layer              │
    │  ├─ CryptoWalletsService   │
    │  ├─ TransakService         │
    │  └─ CryptoOperationsService│
    └──────┬──────────────────────┘
           │
    ┌──────▼──────────┐
    │   SQLite DB     │
    │  (Crypto v2)    │
    └─────────────────┘

External APIs:
├─ Transak (On-ramp)
├─ CoinGecko (Prices)
├─ Jupiter (DEX Swaps)
└─ Blockchain Nodes
```

## Component Structure

```
WalletsPage.tsx
├─ CryptoHoldingsCard
│  ├─ Holdings List
│  └─ Action Buttons (Swap, Sell, Withdraw)
├─ BuyCryptoModal
│  ├─ Form Input
│  ├─ Payment Method Selection
│  └─ Transak Widget Integration
└─ Transaction History
```

## Code Files Reference

### Backend
- `backend/src/domain/wallets/crypto-wallets.service.ts` - Core wallet logic
- `backend/src/domain/wallets/transak.service.ts` - Transak integration
- `backend/src/domain/wallets/crypto-operations.service.ts` - Buy/Swap/Sell
- `backend/src/routes/crypto-wallets.router.ts` - All API endpoints
- `backend/src/app.ts` - Route registration

### Frontend
- `client/src/pages/WalletsPage.tsx` - Main wallet page
- `client/src/components/wallets/CryptoHoldingsCard.tsx` - Holdings display
- `client/src/components/wallets/BuyCryptoModal.tsx` - Buy modal
- `client/src/pages/WalletsPage.css` - Page styles
- `client/src/components/wallets/*.css` - Component styles

### Database
- `backend/src/domain/setup/init_tables.ts` - Table definitions

## Next Steps

### Phase 2: Enhanced Features (Coming Soon)
- [ ] Real blockchain withdrawal implementation
- [ ] Sell crypto back to fiat
- [ ] DEX integration (Jupiter for Solana)
- [ ] Real-time WebSocket price updates
- [ ] Portfolio analytics and charts
- [ ] Tax reporting

### Phase 3: Production Deployment
- [ ] Switch Transak to production credentials
- [ ] Set up Redis caching for prices
- [ ] Enable hardware wallet support
- [ ] Add rate limiting for API endpoints
- [ ] Set up monitoring and alerts

## Support

For issues or questions:
1. Check logs: `backend.log`, `frontend.log`
2. Review API responses for error messages
3. Check database for transaction status
4. Verify Transak webhook signature in logs

---

**Last Updated:** 2025-08-16
**Status:** Production Ready - Phase 1 Complete
