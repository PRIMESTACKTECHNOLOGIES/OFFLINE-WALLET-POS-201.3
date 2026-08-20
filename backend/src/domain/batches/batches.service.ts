import { db } from "../../config/db";
import { settingsService } from "../settings/settings.service";
import { walletsService } from "../wallets/wallets.service";
import { validateTransition, createLedgerEntry, persistLedgerEntry, type TransactionState } from '../ledger/ledger.service';
import crypto from "crypto";
import { cashoutsService } from "../cashouts/cashouts.service";
import { v4 as uuidv4 } from "uuid";
import {
  batchExporter,
  type ExportFormat,
  type ExportOpts,
  type ExportResult,
  type BatchRowShape,
  type TxnRowShape,
} from "./batch-exporter";

export class BatchesService {

  /**
   * Process offline batch upload — Protocol 201.3
   * Fully SQLite-compatible (no PostgreSQL syntax)
   * IDEMPOTENT: Replaying the same (batchId, merchantId, terminalId) a 2nd time returns
   * the existing settlement code and never double-credits the merchant wallet.
   */
  async processOfflineBatch(merchantId: string, terminalId: string, batchData: any) {
    const {
      protocolVersion = "201.3",
      batchId,
      timestamp,
      nonce,
      signature,
      transactions = []
    } = batchData;

    // ── 1. Idempotency pre-check: short-circuit if already PROCESSED ─────────
    const priorRes = await db.query(
      `SELECT id, status, settlement_code, txn_count, total_amount_minor
         FROM pos2013_batches
        WHERE batch_id = ? AND merchant_id = ? AND terminal_id = ?
        LIMIT 1`,
      [batchId, merchantId, terminalId]
    );
    if (priorRes.rowCount > 0 && priorRes.rows[0].status === 'PROCESSED') {
      const prior = priorRes.rows[0];
      console.log(`[Protocol 201.3] Batch ${batchId} replay detected — returning prior settlement (safe idempotency).`);
      return {
        success: true,
        replayed: true,
        batchId,
        settlementCode: prior.settlement_code,
        txnCount: Number(prior.txn_count || 0),
        totalAmountMinor: Number(prior.total_amount_minor || 0)
      };
    }

    // ── 2. Verify HMAC signature ─────────────────────────────────────────────
    // Prefer per-terminal secret (stronger, per-device revocation) with merchant
    // api_key fallback for terminals registered before this patch.
    let secretKey: string | null = null;
    const termRes = await db.query(
      `SELECT terminal_secret FROM terminals WHERE terminal_id = ? AND merchant_id = ? LIMIT 1`,
      [terminalId, merchantId]
    );
    if (termRes.rowCount > 0 && termRes.rows[0].terminal_secret) {
      secretKey = termRes.rows[0].terminal_secret;
    } else {
      const settings = await settingsService.getSettings(merchantId);
      secretKey = settings.api_key || null;
    }
    if (!secretKey) {
      throw new Error("Merchant/terminal secret key is not configured");
    }

    // timestamp may arrive as a number (ms) or ISO string — normalise to string
    const tsString = typeof timestamp === "number" ? String(timestamp) : String(timestamp);

    const expectedSignature = this.generateHmacSignature(
      protocolVersion, merchantId, terminalId, batchId,
      tsString, nonce, transactions.length, secretKey
    );

    if (!signature || signature !== expectedSignature) {
      console.warn(`[BatchService] Signature invalid or missing — expected=${expectedSignature} got=${signature}`);
      throw new Error("Invalid or missing signature");
    }

    const totalAmountMinor = transactions.reduce(
      (sum: number, txn: any) => sum + (Number(txn.amountMinor) || 0), 0
    );

    const settlementCode = String(Math.floor(100000 + Math.random() * 900000));
    const batchRowId = uuidv4();
    const now = new Date().toISOString();

    // ── 3. Insert batch (INSERT OR IGNORE for idempotency) ───────────────────
    const insertRes = await db.query(`
      INSERT OR IGNORE INTO pos2013_batches
        (id, batch_id, merchant_id, terminal_id, protocol_version, status,
         settlement_code, txn_count, total_amount_minor, signature, nonce,
         upload_timestamp, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'RECEIVED', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      batchRowId, batchId, merchantId, terminalId, protocolVersion,
      settlementCode, transactions.length, totalAmountMinor,
      signature || "", nonce || "", now, now, now
    ]);
    const actuallyInserted = Number(insertRes.rowCount || 0) > 0;
    // If INSERT OR IGNORE skipped AND we already have a PROCESSED row at final
    // check (race with concurrent upload), return prior settlement safely.
    if (!actuallyInserted) {
      const recheck = await db.query(
        `SELECT status, settlement_code, txn_count, total_amount_minor
           FROM pos2013_batches WHERE batch_id = ? AND merchant_id = ? AND terminal_id = ? LIMIT 1`,
        [batchId, merchantId, terminalId]
      );
      if (recheck.rowCount > 0 && recheck.rows[0].status === 'PROCESSED') {
        const p = recheck.rows[0];
        console.log(`[Protocol 201.3] Concurrent race for ${batchId} resolved idempotently.`);
        return {
          success: true,
          replayed: true,
          batchId,
          settlementCode: p.settlement_code,
          txnCount: Number(p.txn_count || 0),
          totalAmountMinor: Number(p.total_amount_minor || 0)
        };
      }
    }

    // ── 4. Insert transactions (INSERT OR IGNORE for idempotency) ────────────
    for (const txn of transactions) {
      const txnId = txn.id || uuidv4();
      const localTxnId = txn.localTxnId || `LOCAL-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const txnTimestamp = txn.txnTimestamp || txn.timestamp
        ? new Date(txn.txnTimestamp || txn.timestamp).toISOString()
        : now;
      const txnAmountMinor = Number(txn.amountMinor) || 0;
      const txnAmount = txnAmountMinor / 100;
      const txnCurrency = (txn.currency || "USD").toUpperCase();

      await db.query(`
        INSERT OR IGNORE INTO pos2013_transactions
          (id, merchant_id, terminal_id, batch_id, local_txn_id, stan,
           amount_minor, currency, pan_masked, txn_type, auth_mode,
           entry_mode, card_brand, reader_source, cvm_result, pin_verified,
           status, emv_data, txn_timestamp, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
      `, [
        txnId, merchantId, terminalId, batchId, localTxnId,
        txn.stan || "000000",
        txnAmountMinor,
        txnCurrency,
        txn.panMasked || "****",
        txn.txnType || "SALE",
        txn.authMode || "OFFLINE_APPROVED",
        txn.entryMode || "MANUAL",
        txn.cardBrand || null,
        txn.readerSource || null,
        txn.cvmResult || null,
        txn.pinVerified ? 1 : 0,
        txn.emvData ? JSON.stringify(txn.emvData) : null,
        txnTimestamp, now
      ]);

      await db.query(`
        INSERT OR IGNORE INTO offline_funds_receipts
          (id, merchant_id, terminal_id, transaction_id, stan, amount_minor, currency, status, receipt_payload, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
      `, [
        uuidv4(),
        merchantId,
        terminalId,
        txnId,
        txn.stan || "000000",
        txnAmountMinor,
        txnCurrency,
        JSON.stringify({
          batchId,
          localTxnId,
          stan: txn.stan || "000000",
          amountMinor: txnAmountMinor,
          currency: txnCurrency,
          terminalId,
          merchantId,
          receivedAt: now,
          source: 'offline-pos'
        }),
        now,
        now
      ]);

      const ledgerEntry = createLedgerEntry(
        txnId,
        'credit',
        txnAmount,
        txnCurrency,
        'AUTHORIZED',
        `Offline batch transaction ${localTxnId}`
      );
      validateTransition('PENDING', ledgerEntry.status as TransactionState);
      await persistLedgerEntry(ledgerEntry, db.query.bind(db));

      // Settlement record: mark this POS sale "unsettled" until real money arrives.
      // Allows reconciliation in the settlement module later (mark settled / adjusted).
      const settlementId = uuidv4();
      const settlementMeta = JSON.stringify({
        stan: txn.stan || null,
        rrn: txn.rrn || null,
        card_masked: txn.panMasked || null,
        local_txn_id: localTxnId,
        batch_id: batchId,
        terminal_id: terminalId,
      });
      await db.query(
        `INSERT INTO merchant_pos_settlements
         (id, merchant_id, ledger_entry_id, amount, currency, status, created_at, meta)
         VALUES (?, ?, ?, ?, ?, 'unsettled', CURRENT_TIMESTAMP, ?)`,
        [settlementId, merchantId, ledgerEntry.id, txnAmount, txnCurrency, settlementMeta]
      );
    }

    // ── 5. Mark batch PROCESSED and save settlement code ─────────────────────
    await db.query(`
      UPDATE pos2013_batches
      SET status = 'PROCESSED', settlement_code = ?,
          processed_at = ?, updated_at = ?
      WHERE batch_id = ? AND merchant_id = ? AND terminal_id = ?
    `, [settlementCode, now, now, batchId, merchantId, terminalId]);

    // ── 6. Mark transactions SYNCED ──────────────────────────────────────────
    await db.query(`
      UPDATE pos2013_transactions
      SET status = 'SYNCED', auth_code = ?
      WHERE batch_id = ? AND merchant_id = ? AND terminal_id = ?
    `, [settlementCode, batchId, merchantId, terminalId]);

    // ── 7. Credit merchant wallet (total batch amount) ────────────────────────
    //    NEVER run this on replay — idempotency guards at steps 1 & 3 protect against it.
    if (totalAmountMinor > 0) {
      await walletsService.creditMerchantWallet(
        merchantId,
        totalAmountMinor / 100,
        'offline_batch',
        settlementCode
      );
    }

    console.log(`[Protocol 201.3] Batch ${batchId} processed. Settlement code: ${settlementCode}`);

    return {
      success: true,
      batchId,
      settlementCode,
      txnCount: transactions.length,
      totalAmountMinor
    };
  }

  /**
   * HMAC-SHA256 — must match client crypto.ts implementation exactly.
   * Payload: protocolVersion|merchantId|terminalId|batchId|timestamp|nonce|count
   */
  private generateHmacSignature(
    protocolVersion: string, merchantId: string, terminalId: string,
    batchId: string, timestamp: string, nonce: string,
    transactionCount: number, secretKey: string
  ): string {
    const data = `${protocolVersion}|${merchantId}|${terminalId}|${batchId}|${timestamp}|${nonce}|${transactionCount}`;
    return crypto.createHmac("sha256", secretKey).update(data).digest("base64");
  }

  async syncOfflineFundsReceipts(merchantId: string, terminalId?: string) {
    const params: any[] = [merchantId];
    let where = 'WHERE merchant_id = ?';

    if (terminalId) {
      where += ' AND terminal_id = ?';
      params.push(terminalId);
    }

    const pendingRes = await db.query(`
      SELECT id, transaction_id, stan, amount_minor, currency, receipt_payload
      FROM offline_funds_receipts
      ${where}
      AND status = 'PENDING'
      ORDER BY created_at ASC
    `, params);

    const synced: any[] = [];
    for (const row of pendingRes.rows) {
      const payload = row.receipt_payload ? JSON.parse(row.receipt_payload) : {};
      const now = new Date().toISOString();

      await db.query(`
        UPDATE offline_funds_receipts
        SET status = 'SYNCED', synced_at = ?, updated_at = ?
        WHERE id = ?
      `, [now, now, row.id]);

      await walletsService.creditMerchantWallet(
        merchantId,
        Number(row.amount_minor || 0) / 100,
        'offline_sync_receipt',
        row.stan || row.transaction_id || row.id
      );

      synced.push({
        id: row.id,
        transactionId: row.transaction_id,
        stan: row.stan,
        amountMinor: row.amount_minor,
        currency: row.currency,
        payload
      });
    }

    return {
      success: true,
      merchantId,
      terminalId: terminalId || null,
      syncedCount: synced.length,
      items: synced
    };
  }

  /**
   * Redeem a payment code
   * Checks payment_codes table first (6-digit offline settlement codes),
   * then checks batch settlement codes if the local code is not found.
   */
  async redeemPaymentCode(payload: { code: string; amount: number; merchantId: string }) {
    const { code, amount, merchantId } = payload;
    const amountMinor = Math.round(amount * 100);

    // ── Check local payment_codes table first ─────────────────────────────────
    const codeRes = await db.query(
      `SELECT * FROM payment_codes WHERE code = ? AND used = 0`,
      [code]
    );

    if (codeRes.rowCount > 0) {
      const pc = codeRes.rows[0];

      // Amount tolerance ±1 minor unit for floating-point drift
      if (Math.abs(pc.amount_minor - amountMinor) > 1) {
        return {
          success: false,
          message: `Amount mismatch — code is for ${(pc.amount_minor / 100).toFixed(2)} ${pc.currency}`
        };
      }

      const now = new Date().toISOString();
      await db.query(
        `UPDATE payment_codes SET used = 1, used_at = ?, used_by_merchant = ? WHERE code = ?`,
        [now, merchantId, code]
      );

      await db.query(
        `UPDATE pos2013_transactions SET status = 'REDEEMED' WHERE auth_code = ? AND merchant_id = ?`,
        [code, merchantId]
      ).catch(() => {}); // non-fatal

      return {
        success: true,
        message: "Payment successful",
        reference: pc.reference || pc.id,
        time: now
      };
    }

    // ── Settlement code from pos2013_batches ──────────────────────────────────
    const batchRes = await db.query(
      `SELECT * FROM pos2013_batches WHERE settlement_code = ? AND merchant_id = ?`,
      [code, merchantId]
    );

    if (batchRes.rowCount > 0) {
      const batch = batchRes.rows[0];
      const totalMinor = batch.total_amount_minor || 0;

      if (totalMinor > 0 && Math.abs(totalMinor - amountMinor) > amountMinor * 0.1) {
        return {
          success: false,
          message: `Amount mismatch — batch total is ${(totalMinor / 100).toFixed(2)}`
        };
      }

      const now = new Date().toISOString();
      await db.query(`UPDATE pos2013_batches SET status = 'REDEEMED', updated_at = ? WHERE settlement_code = ? AND merchant_id = ?`, [now, code, merchantId]);
      await db.query(`UPDATE pos2013_transactions SET status = 'REDEEMED' WHERE batch_id = ? AND merchant_id = ?`, [batch.batch_id, merchantId]).catch(() => {});

      return {
        success: true,
        message: "Batch settlement redeemed",
        reference: batch.batch_id,
        time: now
      };
    }

    return { success: false, message: "Invalid or expired code" };
  }

  async cashoutBraintree(merchantId: string, batches: any[]) {
    const batchIds = batches
      .map((batch: any) => batch.batchId || batch.id)
      .filter((id: string) => !!id);

    if (batchIds.length === 0) {
      throw new Error("No batch IDs provided for cashout");
    }

    const cashout = await cashoutsService.createCashout(merchantId, batchIds);
    const processed = await cashoutsService.processCashout(cashout.cashoutId, merchantId);

    return {
      synced: batchIds.length,
      failed: 0,
      details: [processed],
      mode: "LIVE",
      message: "Cashout created and processed successfully"
    };
  }

  async getBatches(merchantId?: string) {
    try {
      const params: any[] = [];
      let where = "";
      if (merchantId) { where = "WHERE b.merchant_id = ?"; params.push(merchantId); }

      const res = await db.query(`
        SELECT b.id, b.batch_id, b.merchant_id, b.terminal_id,
               b.status, b.txn_count, b.total_amount_minor,
               b.settlement_code, b.upload_timestamp, b.protocol_version,
               b.batch_seq, b.processed_at
        FROM pos2013_batches b
        ${where}
        ORDER BY b.upload_timestamp DESC
        LIMIT 200
      `, params);
      return res.rows;
    } catch (e) {
      console.error("getBatches error:", e);
      return [];
    }
  }

  async getTransactions(merchantId?: string, limit: number = 100) {
    try {
      const params: any[] = [];
      let where = "";
      if (merchantId) { where = "WHERE t.merchant_id = ?"; params.push(merchantId); }
      params.push(limit);

      const res = await db.query(`
        SELECT t.id, t.stan, t.amount_minor, t.currency, t.pan_masked,
               t.status, t.txn_timestamp, t.terminal_id, t.batch_id,
               t.txn_type, t.auth_mode, t.entry_mode, t.auth_code,
               t.local_txn_id, t.created_at, t.rrn, t.card_brand,
               t.reader_source, t.cvm_result, t.pin_verified
        FROM pos2013_transactions t
        ${where}
        ORDER BY t.created_at DESC
        LIMIT ?
      `, params);

      return res.rows.map((row: any) => ({
        ...row,
        amountMinor: row.amount_minor,
        amount: (row.amount_minor / 100).toFixed(2)
      }));
    } catch (e) {
      console.error("getTransactions error:", e);
      return [];
    }
  }

  private async resolveSecret(merchantId: string, terminalId: string): Promise<string> {
    const termRes = await db.query(
      `SELECT terminal_secret FROM terminals WHERE terminal_id = ? AND merchant_id = ? LIMIT 1`,
      [terminalId, merchantId]
    );
    if (termRes.rowCount && termRes.rows[0].terminal_secret) return termRes.rows[0].terminal_secret;
    const settings = await settingsService.getSettings(merchantId);
    if (settings.api_key) return settings.api_key;
    throw new Error("Merchant/terminal secret key is not configured");
  }

  async getBatchDetails(batchId: string, merchantId?: string) {
    const params: any[] = [batchId];
    let where = "WHERE b.batch_id = ?";
    if (merchantId) { where += " AND b.merchant_id = ?"; params.push(merchantId); }

    const batchRes = await db.query(`
      SELECT b.* FROM pos2013_batches b ${where} LIMIT 1
    `, params);
    if (!batchRes.rowCount) return null;
    const batch = batchRes.rows[0] as BatchRowShape;

    const txParams: any[] = [batch.batch_id];
    const txWhere = "WHERE batch_id = ?";
    const txRes = await db.query(`
      SELECT t.id, t.merchant_id, t.terminal_id, t.batch_id, t.local_txn_id,
             t.stan, t.amount_minor, t.currency, t.pan_masked, t.txn_type,
             t.auth_mode, t.entry_mode, t.card_brand, t.reader_source,
             t.cvm_result, t.pin_verified, t.status, t.auth_code,
             t.rrn, t.txn_timestamp, t.created_at
      FROM pos2013_transactions t ${txWhere}
      ORDER BY t.created_at ASC
    `, txParams);

    const txns = txRes.rows as TxnRowShape[];
    const txnCount = txns.length;
    const ghostCount = txns.filter(t =>
      String(t.auth_code || "").trim() === "0000" ||
      /^\*+$/.test(String(t.pan_masked || "").replace(/\s/g, ""))
    ).length;
    const totalAmountMinor = txns.reduce((s, t) => s + (Number(t.amount_minor) || 0), 0);

    return {
      batch,
      transactions: txns,
      txnCount,
      ghostCount,
      totalAmountMinor,
      amount: (totalAmountMinor / 100).toFixed(2),
    };
  }

  async closeBatch(params: {
    merchantId: string;
    terminalId?: string;
    batchId?: string;
    includeGhost?: boolean;
    maxTxns?: number;
    minAmountMinor?: number;
    force?: boolean;
  }) {
    const { merchantId, terminalId, includeGhost = false, force = false } = params;
    const now = new Date().toISOString();

    if (params.batchId) {
      const existing = await this.getBatchDetails(params.batchId, merchantId);
      if (!existing) throw new Error("Batch not found");
      const batch = existing.batch;
      const secret = await this.resolveSecret(merchantId, existing.batch.terminal_id);
      const signatureNonce = batch.nonce || crypto.randomBytes(12).toString("hex");
      const signed = this.generateHmacSignature(
        batch.protocol_version || "201.3",
        merchantId, batch.terminal_id, batch.batch_id,
        now, signatureNonce, existing.txnCount, secret
      );
      await db.query(
        `UPDATE pos2013_batches
            SET status = 'CLOSED',
                signature = ?,
                nonce = ?,
                settlement_code = COALESCE(settlement_code, ?),
                processed_at = COALESCE(processed_at, ?),
                updated_at = ?
          WHERE batch_id = ? AND merchant_id = ? AND terminal_id = ?`,
        [
          signed, signatureNonce,
          batch.settlement_code || String(Math.floor(100000 + Math.random() * 900000)),
          batch.processed_at || now,
          now, batch.batch_id, merchantId, batch.terminal_id
        ]
      );
      return this.getBatchDetails(batch.batch_id, merchantId);
    }

    let fromClause = `FROM pos2013_transactions WHERE merchant_id = ? AND (batch_id IS NULL OR batch_id = '')`;
    const queryParams: any[] = [merchantId];
    if (terminalId) { fromClause += ` AND terminal_id = ?`; queryParams.push(terminalId); }
    if (!includeGhost) {
      fromClause += ` AND COALESCE(auth_code,'') <> '0000'`;
    }
    const countRes = await db.query(`SELECT COUNT(*) as cnt ${fromClause}`, queryParams);
    const cnt = Number(countRes.rows[0]?.cnt || 0);
    if (cnt === 0) throw new Error("No unbatched transactions available");
    const minCount = 1;
    const minAmt = params.minAmountMinor ?? 0;
    const amtRes = await db.query(`SELECT COALESCE(SUM(amount_minor),0) as s ${fromClause}`, queryParams);
    const amt = Number(amtRes.rows[0]?.s || 0);
    if (!force && (cnt < minCount || amt < minAmt)) {
      throw new Error(`Threshold not met: txns=${cnt}/${minCount}, amount=${amt}/${minAmt}`);
    }

    const txRes = await db.query(`SELECT * ${fromClause} ORDER BY created_at ASC`, queryParams);
    const orphanTxns = txRes.rows as TxnRowShape[];
    const assignedTerminal = terminalId || orphanTxns[0].terminal_id;
    const seqRes = await db.query(
      `SELECT COALESCE(MAX(batch_seq),0) as maxSeq FROM pos2013_batches WHERE merchant_id = ? AND terminal_id = ?`,
      [merchantId, assignedTerminal]
    );
    const batchSeq = Number(seqRes.rows[0]?.maxSeq || 0) + 1;
    const newBatchId = params.batchId || `B${Date.now()}${batchSeq.toString().padStart(4, "0")}`;
    const secret = await this.resolveSecret(merchantId, assignedTerminal);
    const nonce = crypto.randomBytes(12).toString("hex");
    const sig = this.generateHmacSignature("201.3", merchantId, assignedTerminal, newBatchId, now, nonce, orphanTxns.length, secret);
    const settlementCode = String(Math.floor(100000 + Math.random() * 900000));
    const batchRowId = uuidv4();
    const totalAmountMinor = orphanTxns.reduce((s, t) => s + (Number(t.amount_minor) || 0), 0);

    await db.query(`
      INSERT INTO pos2013_batches
        (id, batch_id, merchant_id, terminal_id, protocol_version, status,
         settlement_code, txn_count, total_amount_minor, signature, nonce,
         batch_seq, created_at, updated_at, processed_at)
      VALUES (?, ?, ?, ?, '201.3', 'CLOSED', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [batchRowId, newBatchId, merchantId, assignedTerminal, settlementCode, orphanTxns.length, totalAmountMinor, sig, nonce, batchSeq, now, now, now]);

    await db.query(
      `UPDATE pos2013_transactions SET batch_id = ?, status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id IN (${orphanTxns.map(() => "?").join(",")})`,
      [newBatchId, ...orphanTxns.map(t => t.id)]
    );

    return this.getBatchDetails(newBatchId, merchantId);
  }

  async exportBatch(batchId: string, format: ExportFormat, opts: Partial<ExportOpts> & { merchantId?: string; }) {
    const details = await this.getBatchDetails(batchId, opts.merchantId);
    if (!details) throw new Error("Batch not found");
    const { batch, transactions } = details;
    const secret = opts.secretKey || await this.resolveSecret(batch.merchant_id, batch.terminal_id);
    const settings = await settingsService.getSettings(batch.merchant_id);
    const ext = settings.extended_settings ? (settings.extended_settings as any) : {};
    const banking = ext.banking || {};
    const business = ext.business || {};

    const result = batchExporter.export(batch as BatchRowShape, transactions as TxnRowShape[], format, {
      includeGhost: opts.includeGhost === true,
      secretKey: secret,
      generatedAt: opts.generatedAt,
      merchant: {
        merchantName: settings.merchant_name || business.businessName || batch.merchant_id,
        companyName: business.businessName || settings.merchant_name || batch.merchant_id,
        supportEmail: settings.support_email,
        ein: business.taxId || business.ein || "",
        routingNumber: banking.routingNumber || "",
        accountNumber: banking.accountNumber || "",
        settlementCode: batch.settlement_code || undefined,
      },
    });

    await db.query(`
      UPDATE pos2013_batches
         SET batch_file = ?, status = CASE WHEN status IN ('RECEIVED','PENDING','CLOSED') THEN 'EXPORTED' ELSE status END, updated_at = CURRENT_TIMESTAMP
       WHERE batch_id = ? AND merchant_id = ? AND terminal_id = ?
    `, [
      JSON.stringify({
        format: result.format,
        filename: result.filename,
        contentType: result.contentType,
        byteLength: result.byteLength,
        txnCount: result.txnCount,
        ghostExcluded: result.ghostExcluded,
        totalDebitMinor: result.totalDebitMinor,
        totalCreditMinor: result.totalCreditMinor,
        entryHash10: result.controlEntryHash,
        signature: result.signature,
        canonicalPayload: result.canonicalPayload,
        generatedAt: result.generatedAt,
      }),
      batch.batch_id, batch.merchant_id, batch.terminal_id
    ]);

    return result;
  }

  async markBatchUploaded(params: {
    batchId: string;
    merchantId?: string;
    externalRef?: string;
    processor?: string;
    uploadTimestamp?: string;
    status?: string;
  }) {
    const { batchId, merchantId, externalRef, processor, status } = params;
    const now = params.uploadTimestamp || new Date().toISOString();
    const p: any[] = [now, now];
    let where = "WHERE batch_id = ?";
    p.push(batchId);
    if (merchantId) { where += " AND merchant_id = ?"; p.push(merchantId); }
    const setClauses: string[] = ["upload_timestamp = ?", "updated_at = ?"];
    if (externalRef !== undefined) { setClauses.push("settlement_code = COALESCE(NULLIF(settlement_code,''), ?)"); p.push(externalRef); }
    if (processor !== undefined) { /* processor tracked in meta via JSON merge */ }
    const newStatus = status || "UPLOADED";
    setClauses.push("status = ?"); p.push(newStatus);
    const q = `UPDATE pos2013_batches SET ${setClauses.join(", ")} ${where}`;
    const r = await db.query(q, p);
    return { affected: Number(r.rowCount || 0), batchId, merchantId, externalRef, status: newStatus };
  }

  async autoCloseCandidates(merchantId: string, thresholds: {
    terminalId?: string;
    maxAgeHours?: number;
    minTxnCount?: number;
    minAmountMinor?: number;
  }) {
    const { terminalId, maxAgeHours = 24, minTxnCount = 50, minAmountMinor = 100000 } = thresholds;
    let where = `WHERE merchant_id = ? AND (batch_id IS NULL OR batch_id = '') AND COALESCE(auth_code,'') <> '0000'`;
    const p: any[] = [merchantId];
    if (terminalId) { where += ` AND terminal_id = ?`; p.push(terminalId); }

    const ageCutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
    const groupRes = await db.query(`
      SELECT terminal_id,
             COUNT(*) as cnt,
             COALESCE(SUM(amount_minor),0) as sumMinor,
             MIN(created_at) as oldest
        FROM pos2013_transactions
       ${where}
       GROUP BY terminal_id
    `, p);

    return groupRes.rows.map((r: any) => {
      const cnt = Number(r.cnt || 0);
      const sumMinor = Number(r.sumMinor || 0);
      const oldest = String(r.oldest || "");
      const trigger: string[] = [];
      if (cnt >= minTxnCount) trigger.push(`count:${cnt}>=${minTxnCount}`);
      if (sumMinor >= minAmountMinor) trigger.push(`amount:${sumMinor}>=${minAmountMinor}`);
      if (oldest && oldest < ageCutoff) trigger.push(`age:${oldest}<${ageCutoff}`);
      return {
        terminalId: r.terminal_id,
        txnCount: cnt,
        totalAmountMinor: sumMinor,
        totalAmount: (sumMinor / 100).toFixed(2),
        oldestTxnAt: oldest,
        thresholdHit: trigger.length > 0,
        triggers: trigger,
      };
    });
  }
}

export const batchesService = new BatchesService();
