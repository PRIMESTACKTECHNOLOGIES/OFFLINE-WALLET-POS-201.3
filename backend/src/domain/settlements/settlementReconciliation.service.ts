import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/db";

interface SettlementBatchItem {
  providerRef: string;
  amount: number;
  currency: string;
  authRef?: string;
  localTxnId?: string;
  stan?: string;
  rrn?: string;
  settledAt?: string;
  status?: string;
  metadata?: unknown;
}

interface ReconcileItemResult {
  matched: boolean;
  localSettlementId?: string;
  providerRef?: string;
  amount: number;
  currency: string;
  status: string;
  reason: string;
  discrepancyId?: string;
  remoteItem: SettlementBatchItem;
}

interface ReconciliationSummary {
  merchantId: string;
  providerConfigured: boolean;
  providerBatchDate?: string;
  processedCount: number;
  matchedCount: number;
  discrepancyCount: number;
  unmatchedLocalCount: number;
  matchedItems: ReconcileItemResult[];
  discrepancies: ReconcileItemResult[];
  errors?: string[];
}

export class SettlementReconciliationService {
  private getSettlementApiUrl(): string | null {
    return process.env.CARD_PROCESSOR_SETTLEMENT_URL?.trim() || null;
  }

  private parseAmount(value: unknown): number {
    if (value === undefined || value === null) return 0;
    if (typeof value === "number") return value;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private safeParseJson(value: any): any {
    if (!value) return null;
    try {
      return typeof value === "string" ? JSON.parse(value) : value;
    } catch {
      return null;
    }
  }

  private normalizeRemoteItem(item: any): SettlementBatchItem | null {
    if (!item) return null;

    const amount = this.parseAmount(item.amount ?? item.settlementAmount ?? item.value ?? item.amount_minor ?? item.amountMinor);
    if (!amount || isNaN(amount)) {
      return null;
    }

    const providerRef = String(item.id || item.providerRef || item.reference || item.settlementReference || item.authorizationReference || item.authReference || item.captureId || item.transferId || item.transfer_id || "").trim();
    const authRef = String(item.authReference || item.authorizationReference || item.authRef || item.authorization_ref || item.rrn || item.stan || "").trim() || undefined;
    const localTxnId = String(item.localTxnId || item.local_txn_id || item.transactionId || item.transaction_id || "").trim() || undefined;
    const stan = String(item.stan || item.authCode || item.code || "").trim() || undefined;
    const rrn = String(item.rrn || item.retrievalReferenceNumber || item.retrieval_reference || "").trim() || undefined;
    const settledAt = String(item.settledAt || item.settlementDate || item.settlement_date || item.completedAt || item.updatedAt || item.date || "").trim() || undefined;
    const currency = String(item.currency || item.ccy || "USD").toUpperCase();
    const status = String(item.status || item.state || "COMPLETED").toUpperCase();

    return {
      providerRef: providerRef || uuidv4(),
      amount,
      currency,
      authRef,
      localTxnId,
      stan,
      rrn,
      settledAt,
      status,
      metadata: item,
    };
  }

  async fetchProcessorSettlementBatch(merchantId: string, settlementDate?: string) {
    const url = this.getSettlementApiUrl();
    if (!url) {
      throw new Error("CARD_PROCESSOR_SETTLEMENT_URL is not configured");
    }

    const params = {
      merchantId,
      date: settlementDate,
    };

    let response;
    try {
      response = await axios.get(url, { params, timeout: 15000 });
    } catch (error: any) {
      if (error?.response?.status === 405 || error?.response?.status === 404) {
        response = await axios.post(url, params, { timeout: 15000 });
      } else {
        throw error;
      }
    }

    const data = response?.data;
    const rawItems = Array.isArray(data) ? data : data?.items || data?.settlements || data?.records || [];
    if (!Array.isArray(rawItems)) {
      throw new Error("Invalid settlement batch response format");
    }

    const items: SettlementBatchItem[] = rawItems
      .map((item: any) => this.normalizeRemoteItem(item))
      .filter((item): item is SettlementBatchItem => item !== null);

    return {
      batchDate: settlementDate || String(data?.date || data?.batchDate || new Date().toISOString().split("T")[0]),
      items,
    };
  }

  async getUnsettledLocalSettlements(merchantId: string) {
    const result = await db.query(
      `SELECT id, merchant_id, ledger_entry_id, amount, currency, status, settled_at, meta, created_at
       FROM merchant_pos_settlements
       WHERE merchant_id = ? AND status = 'unsettled'
       ORDER BY created_at ASC`,
      [merchantId]
    );
    return result.rows || [];
  }

  private async createDiscrepancy(
    merchantId: string,
    providerRef: string | undefined,
    localSettlementId: string | null,
    amount: number,
    currency: string,
    discrepancyType: string,
    details: unknown
  ) {
    const discrepancyId = uuidv4();
    await db.query(
      `INSERT INTO settlement_discrepancies
       (id, merchant_id, provider_ref, local_settlement_id, amount, currency, discrepancy_type, status, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'unresolved', ?, CURRENT_TIMESTAMP)`,
      [discrepancyId, merchantId, providerRef || null, localSettlementId, amount, currency, discrepancyType, JSON.stringify(details || {})]
    );
    return discrepancyId;
  }

  private async findMatchingLocalSettlement(merchantId: string, remote: SettlementBatchItem) {
    const local = await this.getUnsettledLocalSettlements(merchantId);
    if (!local.length) return null;

    const remoteProvider = remote.providerRef?.trim();
    const remoteAuth = remote.authRef?.trim();
    const remoteTxnId = remote.localTxnId?.trim();
    const remoteStan = remote.stan?.trim();
    const remoteRrn = remote.rrn?.trim();

    const candidates: Array<{ row: any; meta: any }> = local.map((row: any) => ({ row, meta: this.safeParseJson(row.meta) }));

    const exactMatch = candidates.find(({ row, meta }) => {
      if (remoteProvider && (row.id === remoteProvider || meta?.provider_ref === remoteProvider || meta?.providerRef === remoteProvider)) {
        return true;
      }
      if (remoteAuth) {
        if (row.ledger_entry_id === remoteAuth) return true;
        if (meta?.rrn === remoteAuth || meta?.stan === remoteAuth || meta?.auth_ref === remoteAuth || meta?.authRef === remoteAuth || meta?.authorization_reference === remoteAuth) {
          return true;
        }
      }
      if (remoteTxnId && meta?.local_txn_id === remoteTxnId) {
        return true;
      }
      if (remoteStan && meta?.stan === remoteStan) {
        return true;
      }
      if (remoteRrn && meta?.rrn === remoteRrn) {
        return true;
      }
      return false;
    });
    if (exactMatch) return exactMatch.row;

    const amountMatches = candidates.filter(({ row }) => Number(row.amount) === remote.amount && String(row.currency).toUpperCase() === String(remote.currency).toUpperCase());
    if (amountMatches.length === 1) {
      return amountMatches[0].row;
    }

    return null;
  }

  async reconcileSettlementItem(merchantId: string, remote: SettlementBatchItem): Promise<ReconcileItemResult> {
    const matchedLocal = await this.findMatchingLocalSettlement(merchantId, remote);
    if (!matchedLocal) {
      const discrepancyId = await this.createDiscrepancy(
        merchantId,
        remote.providerRef,
        null,
        remote.amount,
        remote.currency,
        "missing_local",
        { remote }
      );
      return {
        matched: false,
        providerRef: remote.providerRef,
        amount: remote.amount,
        currency: remote.currency,
        status: "missing_local",
        reason: "No matching local unsettled settlement found",
        discrepancyId,
        remoteItem: remote,
      };
    }

    const amountDiff = Number(matchedLocal.amount) - remote.amount;
    if (Math.abs(amountDiff) > 0.0001 || String(matchedLocal.currency).toUpperCase() !== String(remote.currency).toUpperCase()) {
      const discrepancyId = await this.createDiscrepancy(
        merchantId,
        remote.providerRef,
        matchedLocal.id,
        remote.amount,
        remote.currency,
        "amount_mismatch",
        {
          remote,
          local: matchedLocal,
        }
      );
      return {
        matched: false,
        localSettlementId: matchedLocal.id,
        providerRef: remote.providerRef,
        amount: remote.amount,
        currency: remote.currency,
        status: "amount_mismatch",
        reason: "Amount or currency mismatch between remote settlement and local unsettled settlement",
        discrepancyId,
        remoteItem: remote,
      };
    }

    const existingMeta = this.safeParseJson(matchedLocal.meta) || {};
    const updatedMeta = {
      ...existingMeta,
      provider_ref: remote.providerRef || existingMeta.provider_ref,
      provider_settled_at: remote.settledAt || existingMeta.provider_settled_at,
      reconciled_at: new Date().toISOString(),
    };

    await db.query(
      `UPDATE merchant_pos_settlements
       SET status = 'settled', settled_at = ?, meta = ?
       WHERE id = ?`,
      [remote.settledAt || new Date().toISOString(), JSON.stringify(updatedMeta), matchedLocal.id]
    );

    return {
      matched: true,
      localSettlementId: matchedLocal.id,
      providerRef: remote.providerRef,
      amount: remote.amount,
      currency: remote.currency,
      status: "settled",
      reason: "Remote settlement matched to local unsettled settlement",
      remoteItem: remote,
    };
  }

  async reconcileMerchantSettlements(merchantId: string, settlementDate?: string): Promise<ReconciliationSummary> {
    const summary: ReconciliationSummary = {
      merchantId,
      providerConfigured: false,
      providerBatchDate: settlementDate,
      processedCount: 0,
      matchedCount: 0,
      discrepancyCount: 0,
      unmatchedLocalCount: 0,
      matchedItems: [],
      discrepancies: [],
      errors: [],
    };

    let batchItems: SettlementBatchItem[] = [];
    try {
      const batch = await this.fetchProcessorSettlementBatch(merchantId, settlementDate);
      summary.providerConfigured = true;
      summary.providerBatchDate = batch.batchDate;
      batchItems = batch.items;
    } catch (error: any) {
      summary.errors?.push(error.message || "Unable to fetch processor settlement batch");
    }

    if (!summary.providerConfigured) {
      const unsettled = await this.getUnsettledLocalSettlements(merchantId);
      summary.unmatchedLocalCount = unsettled.length;
      summary.processedCount = 0;
      return summary;
    }

    for (const item of batchItems) {
      const result = await this.reconcileSettlementItem(merchantId, item);
      summary.processedCount += 1;
      if (result.matched) {
        summary.matchedCount += 1;
        summary.matchedItems.push(result);
      } else {
        summary.discrepancyCount += 1;
        summary.discrepancies.push(result);
      }
    }

    const remainingUnsettled = await this.getUnsettledLocalSettlements(merchantId);
    summary.unmatchedLocalCount = remainingUnsettled.length;
    return summary;
  }

  async listDiscrepancies(merchantId: string, status?: string) {
    const params: any[] = [merchantId];
    let sql = `SELECT * FROM settlement_discrepancies WHERE merchant_id = ?`;
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC`;
    const result = await db.query(sql, params);
    return result.rows || [];
  }
}

export const settlementReconciliationService = new SettlementReconciliationService();
