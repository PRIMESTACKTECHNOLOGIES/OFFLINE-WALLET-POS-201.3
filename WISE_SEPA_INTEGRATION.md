# Wise/SEPA Payment Gateway Integration

## Overview
This integration enables **single transaction SEPA payments** via Wise (TransferWise) without batch uploads. Customers can pay directly through the app.

## Architecture

### Backend (Node.js + Express)
- **Route**: `/wise/*` 
- **Service**: Wise API integration
- **Endpoints**:
  - `POST /wise/create-recipient` - Register SEPA recipient
  - `POST /wise/initiate-payment` - Start single transfer
  - `GET /wise/transfer-status/:transferId` - Check status
  - `POST /wise/cancel-payment/:transferId` - Cancel pending transfer
  - `GET /wise/exchange-rate` - Get real-time rates
  - `POST /wise/webhooks` - Webhook handler for status updates

### Flutter App
- **Screen**: `WisePaymentScreen`
- **Features**:
  - IBAN validation
  - Real-time exchange rate display
  - Recipient name + IBAN input
  - Amount and currency selection
  - Payment confirmation

## Setup Instructions

### 1. Environment Configuration

Add to `.env` (backend):
```env
WISE_API_TOKEN=your_wise_api_token_here
NODE_ENV=production  # or sandbox
```

Get API token from: https://wise.com/api

### 2. Database Schema

Create a table to track SEPA transfers:

```sql
CREATE TABLE IF NOT EXISTS sepa_transfers (
  id VARCHAR(36) PRIMARY KEY,
  transfer_id VARCHAR(255) UNIQUE NOT NULL,
  customer_id VARCHAR(36) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  recipient_iban VARCHAR(34) NOT NULL,
  recipient_name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'processing', -- pending, processing, completed, failed, cancelled
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_sepa_transfers_customer 
  ON sepa_transfers(customer_id);

CREATE INDEX IF NOT EXISTS idx_sepa_transfers_status 
  ON sepa_transfers(status);
```

### 3. Backend Integration

Register the Wise router in `app.ts`:

```typescript
import wiseRouter from './routes/wise.router';

app.use('/api/wise', wiseRouter);
```

### 4. Flutter Integration

Add to `main.dart` or your routing:

```dart
import 'package:flutter_pos/presentation/screens/wise_payment_screen.dart';

// In your navigation
Navigator.push(
  context,
  MaterialPageRoute(builder: (_) => WisePaymentScreen()),
);
```

### 5. API Client Setup

Create a service for API calls in Flutter:

```dart
class WiseApiService {
  final String baseUrl = 'http://your-api.com/api';
  
  Future<void> initiatePayment(Map<String, dynamic> payload) async {
    final response = await http.post(
      Uri.parse('$baseUrl/wise/initiate-payment'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );
    
    if (response.statusCode != 200) {
      throw Exception('Payment initiation failed');
    }
  }
  
  Future<String> checkStatus(String transferId) async {
    final response = await http.get(
      Uri.parse('$baseUrl/wise/transfer-status/$transferId'),
    );
    
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['status'];
    }
    throw Exception('Status check failed');
  }
}
```

## Payment Flow

### Single Transaction Process

1. **Customer initiates payment**:
   - Enters amount, currency, recipient IBAN, name
   - App shows real-time exchange rate
   - Clicks "Initiate Payment"

2. **Backend processes**:
   - Validates IBAN format
   - Creates Wise quote (gets rate)
   - Creates transfer
   - Funds transfer from account balance
   - Stores transfer record in DB
   - Returns transfer ID to app

3. **Customer receives confirmation**:
   - Shows transfer ID and status
   - Polls `/wise/transfer-status/:transferId` every 5 seconds
   - Updates status in real-time

4. **Webhook updates** (optional):
   - Wise sends webhook when transfer completes
   - Backend processes webhook and updates DB
   - App fetches latest status

## Testing

### Sandbox Credentials

1. Create Wise Sandbox account: https://sandbox.wise.com
2. Get test API token
3. Set `NODE_ENV=sandbox` in .env
4. Use test IBAN: `DE89370400440532013000`

### Test Endpoints

```bash
# Create recipient
curl -X POST http://localhost:7000/api/wise/create-recipient \
  -H "Content-Type: application/json" \
  -d '{
    "accountHolder": "John Doe",
    "iban": "DE89370400440532013000",
    "currency": "EUR"
  }'

# Initiate payment
curl -X POST http://localhost:7000/api/wise/initiate-payment \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_123",
    "amount": 100,
    "currency": "EUR",
    "targetAccountId": "acc_123",
    "recipientIban": "DE89370400440532013000",
    "recipientName": "Jane Smith",
    "purpose": "Invoice payment"
  }'

# Check status
curl http://localhost:7000/api/wise/transfer-status/TF123456

# Get exchange rate
curl "http://localhost:7000/api/wise/exchange-rate?source=EUR&target=GBP"
```

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid IBAN` | Wrong IBAN format | Validate IBAN before submission |
| `Insufficient balance` | Not enough funds | Check account balance |
| `Transfer failed` | Wise API error | Retry or contact support |
| `Recipient not found` | Invalid account ID | Verify recipient exists |

## Webhook Setup

To receive status updates from Wise:

1. Go to Wise API Dashboard
2. Configure webhook URL: `https://your-api.com/api/wise/webhooks`
3. Subscribe to events: `transfer.completed`, `transfer.failed`, `transfer.cancelled`
4. Verify webhook signature in your handler

Example webhook signature verification:

```typescript
import crypto from 'crypto';

function verifyWiseWebhook(req: Request): boolean {
  const signature = req.headers['x-wise-signature'];
  const body = JSON.stringify(req.body);
  const secret = process.env.WISE_WEBHOOK_SECRET;
  
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64');
  
  return hash === signature;
}
```

## Compliance Notes

- ✅ **SEPA-compliant**: Follows EU SEPA regulations
- ✅ **Single transactions only**: No batch processing
- ✅ **KYC compliant**: Wise handles customer verification
- ⚠️ **PSD2**: Ensure user authentication for payments
- ⚠️ **Data protection**: Store IBAN securely (encrypted)

## Next Steps

1. Register with Wise Business API
2. Set up webhook endpoint
3. Store transfer records in DB
4. Add payment history UI
5. Implement receipt/invoice generation
6. Add retry logic for failed transfers
7. Set up alerts for payment failures

## Support

- Wise API Docs: https://wise.com/guide/docs/
- Error codes: https://wise.com/guide/docs/errors
- Sandbox: https://sandbox.wise.com
