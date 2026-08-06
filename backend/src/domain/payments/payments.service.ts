import axios from 'axios';
import { db } from "../../config/db";
import { validateTransition, createLedgerEntry, persistLedgerEntry, type TransactionState } from '../ledger/ledger.service';
import { buildEmvChargePayload } from './emv-tlv-parser';
import type { OnlineAuthorizationResult } from './pos-decision.service';

interface PosTransactionPayload {
  amountMinor: number;
  currency: string;
  pan?: string;
  expiry?: string;
  cvv?: string;
  emv?: Record<string, unknown>;
  terminalId?: string;
  merchantId?: string;
  customerId?: string;
  stan?: string;
}

interface PosTransactionResult {
  success: boolean;
  status: 'APPROVED' | 'DECLINED' | 'PENDING';
  paymentIntentId?: string;
  clientSecret?: string;
  amountMinor: number;
  currency: string;
  processor: string;
  authCode?: string;
  error?: string;
  reason?: string;
  idempotent?: boolean;
}

export class PaymentsService {

  private buildIdempotencyKey(payload: PosTransactionPayload): string {
    const merchantId = (payload.merchantId || '').toString();
    const terminalId = (payload.terminalId || '').toString();
    const stan = (payload.stan || '').toString();
    const customerId = (payload.customerId || '').toString();
    const amountMinor = Number(payload.amountMinor || 0);
    const currency = (payload.currency || 'USD').toString();

    return `POS:${merchantId}:${terminalId}:${stan || 'AUTO'}:${amountMinor}:${currency}:${customerId}`.replace(/\s+/g, '');
  }

  private async getCachedResult(idempotencyKey: string): Promise<PosTransactionResult | null> {
    const res = await db.query('SELECT result_json FROM pos_idempotency WHERE idempotency_key = ?', [idempotencyKey]);
    if (!res.rows?.length) return null;

    const cached = res.rows[0]?.result_json;
    if (!cached) return null;

    try {
      return JSON.parse(cached) as PosTransactionResult;
    } catch {
      return null;
    }
  }

  private async saveIdempotencyResult(idempotencyKey: string, result: PosTransactionResult) {
    await db.query(
      `INSERT OR REPLACE INTO pos_idempotency (idempotency_key, result_json, created_at, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [idempotencyKey, JSON.stringify(result)]
    );
  }

  private getProcessorBaseUrl(): string | null {
    return process.env.CARD_PROCESSOR_URL?.trim() || process.env.PAYMENT_PROCESSOR_URL?.trim() || null;
  }

  private getProcessorApiKey(): string | null {
    return process.env.CARD_PROCESSOR_KEY?.trim() || process.env.PAYMENT_PROCESSOR_KEY?.trim() || null;
  }

  private async authorizeOnlineCharge(payload: PosTransactionPayload): Promise<OnlineAuthorizationResult> {
    const processorUrl = this.getProcessorBaseUrl();
    if (!processorUrl) {
      return {
        success: false,
        status: 'CONFIGURATION_ERROR',
        processor: { approved: false, reason: 'CARD_PROCESSOR_URL or PAYMENT_PROCESSOR_URL not configured' },
        error: 'Payment processor endpoint is not configured',
      };
    }

    const emvPayload = buildEmvChargePayload(payload.emv);
    const body: Record<string, unknown> = {
      amountMinor: payload.amountMinor,
      amount: Number(payload.amountMinor) / 100,
      currency: payload.currency || 'USD',
      merchantId: payload.merchantId,
      terminalId: payload.terminalId,
      stan: payload.stan || `STAN${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      pan: payload.pan,
      expiry: payload.expiry,
      cvv: payload.cvv,
      customerId: payload.customerId,
      source: 'pos_transaction',
      emv: emvPayload,
    };

    const field55 = String(payload.emv?.field55 || payload.emv?.field55Hex || payload.emv?.field55hex || payload.emv?.tlvRaw || payload.emv?.TLV || '').trim();
    if (field55) {
      body.field55 = field55;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const apiKey = this.getProcessorApiKey();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    try {
      const response = await axios.post(processorUrl, body, { headers, timeout: 15000 });
      const data = response?.data || {};
      const approved = data.success === true || data.approved === true || /^(approved|authorized|paid)$/i.test(String(data.status || data.statusCode || ''));
      const authCode = String(data.authCode || data.authorizationCode || data.AuthorizationCode || data.auth_code || data.paymentId || data.id || '').trim() || undefined;
      const paymentIntentId = String(data.paymentIntentId || data.paymentId || data.id || '').trim() || undefined;

      if (!approved) {
        return {
          success: false,
          status: String(data.status || data.statusCode || 'DECLINED'),
          processor: { approved: false, code: String(data.status || data.statusCode || ''), reason: String(data.message || data.error || 'Processor declined') },
          error: String(data.message || data.error || 'Processor declined'),
        };
      }

      return {
        success: true,
        status: String(data.status || 'APPROVED'),
        processor: { approved: true, code: authCode, reason: 'Processor approved' },
        authCode,
        paymentIntentId,
      };
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Processor request failed';
      return {
        success: false,
        status: 'ERROR',
        processor: { approved: false, reason: message },
        error: message,
      };
    }
  }

  async charge(_merchantId: string, payload: PosTransactionPayload) {
    const merchantId = payload.merchantId || _merchantId;
    return this.processPosTransaction({ ...payload, merchantId });
  }

  async processPosTransaction(payload: PosTransactionPayload): Promise<PosTransactionResult> {
    const idempotencyKey = this.buildIdempotencyKey(payload);
    const cachedResult = await this.getCachedResult(idempotencyKey);
    if (cachedResult) {
      return {
        ...cachedResult,
        idempotent: true,
        reason: cachedResult.reason || 'Duplicate request returned cached result',
      };
    }

    const processorName = 'OFFLINE';
    const merchantId = payload.merchantId || '';

    try {
      // Decide whether we need to go online using the POS decision service
      try {
        const { posDecisionService } = await import('./pos-decision.service');
        const decision = await posDecisionService.decide({
          merchantId: payload.merchantId || '',
          terminalId: payload.terminalId || '',
          amountMinor: payload.amountMinor,
          currency: payload.currency || 'USD',
          emv: payload.emv,
        });

        // If decision requires online authorization, attempt it
        if (decision.mode === 'online' || decision.decision === 'ONLINE_APPROVE' || decision.onlineRequired) {
          const online = await this.authorizeOnlineCharge(payload);
          if (!online.success) {
            const resp: PosTransactionResult = {
              success: false,
              status: 'DECLINED',
              amountMinor: payload.amountMinor,
              currency: payload.currency,
              processor: 'PROCESSOR',
              error: online.error || 'Online authorization failed',
              reason: online.error || 'Online authorization failed'
            };
            await this.saveIdempotencyResult(this.buildIdempotencyKey(payload), resp);
            return resp;
          }

          // On approved online auth, record auth details and proceed to settlement/ledger
          const paymentIntentId = online.paymentIntentId || `onl_${Date.now().toString(36)}`;
          const authCode = online.authCode || `AUTH-${Date.now().toString(36).toUpperCase()}`;

          const ledgerEntry = createLedgerEntry(
            paymentIntentId,
            'credit',
            payload.amountMinor,
            payload.currency || 'USD',
            'AUTHORIZED',
            `Online card charge — PAN ${payload.pan ? payload.pan.slice(-4) : 'N/A'}`
          );

          validateTransition('PENDING', ledgerEntry.status as TransactionState);
          await persistLedgerEntry(ledgerEntry, db.query.bind(db));

          // Credit merchant wallet or customer wallet
          const { walletsService } = await import('../wallets/wallets.service');
          if (payload.customerId) {
            await walletsService.topupWallet(payload.customerId, payload.amountMinor / 100, 'pos_charge', paymentIntentId);
          } else {
            const merchantWallet = await walletsService.getOrCreateMerchantWallet(merchantId);
            await db.query(
              `UPDATE merchant_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [payload.amountMinor / 100, merchantWallet.id]
            );
          }

          const response: PosTransactionResult = {
            success: true,
            status: 'APPROVED',
            paymentIntentId,
            amountMinor: payload.amountMinor,
            currency: payload.currency,
            processor: 'ONLINE',
            authCode,
            reason: 'POS transaction approved online',
          };

          await this.saveIdempotencyResult(this.buildIdempotencyKey(payload), response);
          return response;
        }
      } catch (decErr: any) {
        // If decision service fails, fallback to offline behavior below
        console.warn('POS decision service error, proceeding with offline flow', decErr?.message || decErr);
      }

      const paymentIntentId = `offline_${Date.now().toString(36)}`;
      const authCode = `OFFLINE-${Date.now().toString(36).toUpperCase()}`;

      const ledgerEntry = createLedgerEntry(
        paymentIntentId,
        'credit',
        payload.amountMinor,
        payload.currency || 'USD',
        'AUTHORIZED',
        `Offline card charge — PAN ${payload.pan ? payload.pan.slice(-4) : 'N/A'}`
      );

      validateTransition('PENDING', ledgerEntry.status as TransactionState);
      await persistLedgerEntry(ledgerEntry, db.query.bind(db));

      const { walletsService } = await import('../wallets/wallets.service');

      if (payload.customerId) {
        await walletsService.topupWallet(payload.customerId, payload.amountMinor / 100, 'pos_charge', paymentIntentId);
      } else {
        const merchantWallet = await walletsService.getOrCreateMerchantWallet(merchantId);
        await db.query(
          `UPDATE merchant_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [payload.amountMinor / 100, merchantWallet.id]
        );
      }

      const response: PosTransactionResult = {
        success: true,
        status: 'APPROVED',
        paymentIntentId,
        amountMinor: payload.amountMinor,
        currency: payload.currency,
        processor: processorName,
        authCode,
        reason: 'POS transaction approved offline',
      };

      await this.saveIdempotencyResult(idempotencyKey, response);
      return response;

    } catch (e: any) {
      console.error('Charge failed:', e.message);

      const response: PosTransactionResult = {
        success: false,
        status: 'DECLINED',
        error: e.message || 'Charge failed',
        amountMinor: payload.amountMinor,
        currency: payload.currency,
        processor: processorName,
        reason: 'POS transaction declined',
      };

      await this.saveIdempotencyResult(idempotencyKey, response);
      return response;
    }
  }

}

export const paymentsService = new PaymentsService();
