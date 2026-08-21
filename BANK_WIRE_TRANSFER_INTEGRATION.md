# Bank Wire Transfer (Wise USD Account) - Integration Guide

## Overview
Customers can send USD payments directly to your Wise account via bank wire transfer. This is a **local USD transfer** (not international), making it fast and low-cost.

## Account Details

```
Payee Name:           Wise US Inc
Currency:             USD
Wire Routing Number:  021000021
Account Number:       205756130
Account Type:         Checking / Business Checking
Reference Code:       P201006522 ⚠️ MUST be included
Bank Name:            JPMORGAN CHASE BANK
Bank Address:         270 Park Avenue, New York, NY 10017
Bank Phone:           +1 212 270 6000
Amount to Send:       117,123.08 USD (or partial payments)
Our Address:          30 W 26th Street, Floor 6, New York, NY 10010
```

## Setup Instructions

### 1. Backend Integration

Register the bank transfer router in `app.ts`:

```typescript
import bankTransferRouter from './routes/bank-transfer.router';

app.use('/api/bank-transfer', bankTransferRouter);
```

### 2. Flutter Integration

Add the bank transfer payment screen to your navigation:

```dart
import 'package:flutter_pos/presentation/screens/bank_transfer_payment_screen.dart';

// In your payment method selection
if (selectedMethod == 'bank_transfer') {
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => BankTransferPaymentScreen(),
    ),
  );
}
```

### 3. Database Schema

Track incoming wire transfers:

```sql
CREATE TABLE IF NOT EXISTS wire_transfers (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  sender_name VARCHAR(255),
  sender_bank VARCHAR(255),
  reference_code VARCHAR(50),
  transaction_id VARCHAR(255) UNIQUE,
  status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, settled, failed
  received_date TIMESTAMP,
  settled_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX idx_wire_transfers_customer ON wire_transfers(customer_id);
CREATE INDEX idx_wire_transfers_reference ON wire_transfers(reference_code);
```

## Payment Flow

### Customer Perspective

1. **Select Payment Method** → Choose "Bank Wire Transfer"
2. **View Details** → See bank account details on screen
3. **Copy Details** → Click copy icon to copy each field
4. **Make Transfer** → Log into their bank and send wire transfer
5. **Include Reference** → MUST enter reference code: P201006522
6. **Send** → Initiate the wire transfer
7. **Confirmation** → Receive email within 1-2 business days

### Backend Processing

1. **Monitor Wise Account** → Check for incoming transfers
2. **Verify Reference** → Confirm P201006522 is included
3. **Match Customer** → Link transfer to customer account
4. **Update Balance** → Add received amount to customer balance
5. **Send Receipt** → Email customer confirmation
6. **Record Transaction** → Log in database for auditing

## API Endpoints

### Get Bank Details for Display
```bash
GET /api/bank-transfer/wise-usd-details

Response:
{
  "success": true,
  "paymentMethod": "Wire Transfer (USD)",
  "bankDetails": {
    "payeeName": "Wise US Inc",
    "currency": "USD",
    "routingNumber": "021000021",
    "accountNumber": "205756130",
    "accountType": "Checking / Business Checking",
    "referenceCode": "P201006522",
    ...
  },
  "instructions": {...},
  "limitations": {
    "currency": "USD only",
    "processingTime": "1-2 business days"
  }
}
```

### Verify Reference Code
```bash
POST /api/bank-transfer/verify-reference
Content-Type: application/json

{
  "referenceCode": "P201006522"
}

Response:
{
  "valid": true,
  "correctCode": "P201006522",
  "message": "Reference code is correct"
}
```

### Record Incoming Payment
```bash
POST /api/bank-transfer/payment-received
Content-Type: application/json

{
  "customerId": "cust_123",
  "amount": 117123.08,
  "currency": "USD",
  "senderName": "John Doe",
  "senderBank": "Wells Fargo",
  "transactionId": "TXID12345",
  "referenceCode": "P201006522",
  "receiptDate": "2025-08-21T10:30:00Z"
}

Response:
{
  "success": true,
  "message": "Wire transfer payment recorded",
  "payment": {
    "customerId": "cust_123",
    "amount": 117123.08,
    "currency": "USD",
    "receivedAt": "2025-08-21T10:30:00Z"
  }
}
```

## Important Points

### ✅ DO:
- ✓ Include reference code P201006522 in EVERY transfer
- ✓ Use "Domestic USD Transfer" option (not international)
- ✓ Send to JPMORGAN CHASE BANK routing number 021000021
- ✓ Allow 1-2 business days for settlement
- ✓ Send partial payments if needed

### ❌ DON'T:
- ✗ Mark as international transfer
- ✗ Omit the reference code
- ✗ Add extra text to reference field (only P201006522)
- ✗ Expect instant settlement (takes 1-2 business days)

## Monitoring Transfers

### Manual Process (Until Webhook Integration)

1. **Log into Wise Dashboard** at https://wise.com
2. **Navigate to Transactions**
3. **Filter by**: Received payments, USD currency
4. **For each transfer**:
   - Verify reference code P201006522
   - Get customer ID from your system
   - Call `/api/bank-transfer/payment-received`
   - Update customer balance
   - Send receipt email

### Automated Webhook (Future)

Wise can send webhooks for incoming transfers:

```typescript
// Future: Webhook signature verification
import crypto from 'crypto';

function verifyWiseWebhookSignature(req: Request): boolean {
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

## Testing

### Test Scenario 1: Display Details
```bash
curl http://localhost:7000/api/bank-transfer/wise-usd-details
```

### Test Scenario 2: Verify Reference
```bash
curl -X POST http://localhost:7000/api/bank-transfer/verify-reference \
  -H "Content-Type: application/json" \
  -d '{"referenceCode": "P201006522"}'
```

### Test Scenario 3: Record Payment
```bash
curl -X POST http://localhost:7000/api/bank-transfer/payment-received \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_123",
    "amount": 1000,
    "currency": "USD",
    "senderName": "Test Sender",
    "senderBank": "Test Bank",
    "referenceCode": "P201006522"
  }'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Transfer not matched | Reference code missing | Ask customer to include P201006522 |
| Slow settlement | Normal processing | Allow 1-2 business days |
| Transfer rejected | Wrong routing number | Verify: 021000021 |
| Funds lost | Account number error | Check: 205756130 |
| High fees | Marked as international | Use domestic USD transfer option |

## Security

### Protect Reference Code
- ✓ Display P201006522 clearly in UI
- ✓ Allow one-click copy for customers
- ✓ Validate on all incoming transfers
- ✓ Log all transfers with reference verification

### Data Protection
- ✓ Encrypt wire transfer records in database
- ✓ Don't store sender bank details permanently
- ✓ Comply with PCI-DSS (payment data security)
- ✓ Audit log all payment processing

## Next Steps

1. ✅ Display bank details to customers (Flutter UI ready)
2. ⏳ Set up manual monitoring of Wise account
3. ⏳ Implement automated payment recording
4. ⏳ Create webhook endpoint for Wise
5. ⏳ Add payment reconciliation reports
6. ⏳ Implement automatic customer notification emails

## Support

- **Wise Support**: +1 212 270 6000
- **Our Address**: 30 W 26th Street, Floor 6, New York, NY 10010
- **Customer Service**: support@wise.com

---

**Reference Code**: P201006522 ⚠️ Always include this in transfers
**Processing Time**: 1-2 business days
**Currency**: USD only
**Transfer Type**: Domestic (not international)
