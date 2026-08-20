import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

const router = express.Router();

// Initialize Postgres pool (use DATABASE_URL from environment)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Verify and decode Transak webhook JWT
interface DecodedWebhook {
  webhookData: any;
  [key: string]: any;
}

async function verifyTransakWebhook(token: string): Promise<DecodedWebhook | null> {
  try {
    const accessToken = process.env.PARTNER_ACCESS_TOKEN;
    if (!accessToken) {
      console.error('PARTNER_ACCESS_TOKEN not set');
      return null;
    }

    // Verify JWT using Partner Access Token as the secret
    const decoded = jwt.verify(token, accessToken) as DecodedWebhook;
    return decoded;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

// Webhook endpoint: receive Transak order/payment events
router.post('/webhooks/transak', async (req: Request, res: Response) => {
  try {
    const rawData = req.body.data;

    if (!rawData) {
      return res.status(400).json({ error: 'Missing data field' });
    }

    // Verify and decode the JWT
    const decodedWebhook = await verifyTransakWebhook(rawData);
    if (!decodedWebhook) {
      return res.status(401).json({ error: 'Invalid or expired webhook signature' });
    }

    const webhookData = decodedWebhook.webhookData || decodedWebhook;
    const eventType = decodedWebhook.eventID || 'UNKNOWN';
    const eventId = webhookData.id || `event-${Date.now()}`;

    // Store raw webhook event (idempotency check)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if event already processed
      const existing = await client.query(
        'SELECT id FROM transak_webhook_events WHERE event_id = $1',
        [eventId]
      );

      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        return res.status(200).json({ status: 'already_processed', eventId });
      }

      // Insert raw webhook event
      const insertEventResult = await client.query(
        `INSERT INTO transak_webhook_events (event_id, raw_body, decoded_data, event_type, received_at, processing_status)
         VALUES ($1, $2, $3, $4, now(), 'pending')
         RETURNING id`,
        [eventId, JSON.stringify(req.body), JSON.stringify(decodedWebhook), eventType]
      );

      const webhookEventId = insertEventResult.rows[0].id;

      // Extract payment info from webhook
      const fiatAmount = webhookData.fiatAmount;
      const currency = webhookData.fiatCurrency || 'USD';
      const amountCents = Math.round(fiatAmount * 100);
      const receivedAt = webhookData.completedAt || webhookData.createdAt || new Date().toISOString();
      const paymentId = webhookData.paymentId || webhookData.id;

      // Try to extract VBA account from pgData.paymentOptions
      let vbaAccount: string | null = null;
      if (webhookData.cardPaymentData?.pgData?.paymentOptions) {
        for (const option of webhookData.cardPaymentData.pgData.paymentOptions) {
          if (option.fields) {
            for (const field of option.fields) {
              if (field.name?.toUpperCase().includes('IBAN') || field.name?.toUpperCase().includes('ACCOUNT')) {
                vbaAccount = field.value;
                break;
              }
            }
          }
          if (vbaAccount) break;
        }
      }

      // Insert incoming payment
      const incomingPaymentResult = await client.query(
        `INSERT INTO incoming_payments (transak_event_id, provider_payment_id, provider_vba_id, vba_account, amount_cents, currency, received_at, payer_reference, status, match_status, match_confidence, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'unmatched', 0, $10)
         RETURNING id`,
        [
          webhookEventId,
          paymentId,
          webhookData.virtualBankId || null,
          vbaAccount,
          amountCents,
          currency,
          receivedAt,
          `Transak Order: ${webhookData.id}`,
          webhookData.status || 'CREATED',
          JSON.stringify(webhookData),
        ]
      );

      const incomingPaymentId = incomingPaymentResult.rows[0].id;

      // Mark event as processed
      await client.query(
        'UPDATE transak_webhook_events SET processing_status = $1, processed_at = now() WHERE id = $2',
        ['processed', webhookEventId]
      );

      // Attempt automatic reconciliation
      if (vbaAccount) {
        const matchResult = await attemptAutoMatch(client, incomingPaymentId, vbaAccount, amountCents, currency);
        if (matchResult.matched) {
          console.log(`Auto-matched incoming payment ${incomingPaymentId} to POS transaction ${matchResult.posTransactionId}`);
        } else {
          console.log(`Incoming payment ${incomingPaymentId} requires manual review (${matchResult.reason})`);
        }
      }

      await client.query('COMMIT');

      res.status(200).json({
        status: 'received',
        eventId,
        incomingPaymentId,
        message: 'Webhook processed successfully',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Automatic reconciliation matcher
async function attemptAutoMatch(
  client: any,
  incomingPaymentId: string,
  vbaAccount: string,
  amountCents: number,
  currency: string
): Promise<{ matched: boolean; posTransactionId?: string; reason: string }> {
  try {
    // Find POS transaction with exact VBA + amount match
    const matchResult = await client.query(
      `SELECT id, merchant_id FROM pos_transactions
       WHERE assigned_vba_account = $1
       AND amount_cents = $2
       AND currency = $3
       AND status = 'pending'
       LIMIT 1`,
      [vbaAccount, amountCents, currency]
    );

    if (matchResult.rows.length === 0) {
      return { matched: false, reason: 'No POS transaction found with matching VBA and amount' };
    }

    const posTransaction = matchResult.rows[0];

    // Create reconciliation match
    await client.query(
      `INSERT INTO reconciliation_matches (incoming_payment_id, pos_transaction_id, matched_at, matcher, confidence, notes)
       VALUES ($1, $2, now(), 'auto-webhook', 100.00, 'Automatic match: vba+amount')`,
      [incomingPaymentId, posTransaction.id]
    );

    // Update incoming payment
    await client.query(
      `UPDATE incoming_payments SET match_status = 'matched', matched_pos_transaction_id = $1, match_confidence = 100.00, updated_at = now()
       WHERE id = $2`,
      [posTransaction.id, incomingPaymentId]
    );

    // Update POS transaction to settled
    await client.query(
      `UPDATE pos_transactions SET status = 'settled', updated_at = now() WHERE id = $1`,
      [posTransaction.id]
    );

    return { matched: true, posTransactionId: posTransaction.id, reason: 'Auto-matched' };
  } catch (error) {
    console.error('Auto-match error:', error);
    return { matched: false, reason: 'Error during auto-match attempt' };
  }
}

// Health check
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'transak-webhook' });
});

// Get reconciliation report
router.get('/api/v1/reconciliation/report', async (req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE match_status = 'matched') as matched_count,
          COUNT(*) FILTER (WHERE match_status = 'unmatched') as unmatched_count,
          COUNT(*) FILTER (WHERE match_status = 'ambiguous') as ambiguous_count,
          COUNT(*) FILTER (WHERE match_status = 'duplicate') as duplicate_count,
          COUNT(*) as total_incoming,
          SUM(amount_cents) FILTER (WHERE match_status = 'matched') as matched_amount_cents,
          SUM(amount_cents) as total_amount_cents
        FROM incoming_payments
      `);

      res.status(200).json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Get unmatched incoming payments
router.get('/api/v1/reconciliation/unmatched', async (req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT id, provider_payment_id, vba_account, amount_cents, currency, received_at, payer_reference, match_status, raw_payload
        FROM incoming_payments
        WHERE match_status IN ('unmatched', 'ambiguous')
        ORDER BY received_at DESC
        LIMIT 100
      `);

      res.status(200).json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Unmatched query error:', error);
    res.status(500).json({ error: 'Failed to fetch unmatched payments' });
  }
});

// Manual match endpoint
router.post('/api/v1/reconciliation/manual-match', async (req: Request, res: Response) => {
  try {
    const { incoming_payment_id, pos_transaction_id, reason, override_confidence } = req.body;

    if (!incoming_payment_id || !pos_transaction_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create match record
      await client.query(
        `INSERT INTO reconciliation_matches (incoming_payment_id, pos_transaction_id, matched_at, matcher, confidence, notes)
         VALUES ($1, $2, now(), 'manual', $3, $4)`,
        [incoming_payment_id, pos_transaction_id, override_confidence || 95, reason]
      );

      // Update incoming payment
      await client.query(
        `UPDATE incoming_payments SET match_status = 'matched', matched_pos_transaction_id = $1, match_confidence = $2, updated_at = now()
         WHERE id = $3`,
        [pos_transaction_id, override_confidence || 95, incoming_payment_id]
      );

      // Update POS transaction
      await client.query(
        `UPDATE pos_transactions SET status = 'settled', updated_at = now() WHERE id = $1`,
        [pos_transaction_id]
      );

      await client.query('COMMIT');

      res.status(200).json({ status: 'matched', message: 'Manual match created' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Manual match error:', error);
    res.status(500).json({ error: 'Failed to create manual match' });
  }
});

export default router;
