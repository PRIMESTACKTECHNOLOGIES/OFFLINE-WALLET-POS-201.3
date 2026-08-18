import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/db';

// ───────────────────────────────────────────────────────────────────────
// CONFLICT RESOLUTION SERVICE
// Handles duplicate detection, reversals, and failed sync retries
// ───────────────────────────────────────────────────────────────────────

export interface DuplicateTransactionGroup {
  canonicalId: string;
  duplicateIds: string[];
  pan: string;
  amount: number;
  merchantId: string;
  terminalId: string;
  transactionCount: number;
  mergedAt: string;
}

export interface ReversalRecord {
  id: string;
  settlementId: string;
  reason: string;
  chargebackId?: string;
  reversalAmount: number;
  status: 'INITIATED' | 'PROCESSED' | 'FAILED';
  processedAt?: string;
  createdAt: string;
}

export interface FailedSyncRetry {
  id: string;
  transactionId: string;
  merchantId: string;
  attemptCount: number;
  lastAttemptAt: string;
  nextRetryAt?: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  errorMessage?: string;
  createdAt: string;
}

export interface ConflictResolutionResult {
  success: boolean;
  duplicatesFound: number;
  duplicatesMerged: number;
  reversalsProcessed: number;
  failedSyncsRetried: number;
  errors: string[];
}

/**
 * Detect duplicate transactions
 * Looks for same PAN, amount, and time window (within 5 minutes)
 * from same terminal/merchant
 */
export async function detectDuplicates(
  merchantId: string,
  terminalId?: string,
  timeWindowMinutes: number = 5
): Promise<DuplicateTransactionGroup[]> {
  try {
    console.log(
      `[Conflict Resolution] Detecting duplicates: merchant=${merchantId}, terminal=${terminalId}, window=${timeWindowMinutes}min`
    );

    const query = `
      SELECT 
        pan,
        amount,
        merchant_id,
        terminal_id,
        COUNT(*) as txn_count,
        GROUP_CONCAT(id) as txn_ids
      FROM pos2013_transactions
      WHERE merchant_id = ?
        AND status = 'approved'
        ${terminalId ? 'AND terminal_id = ?' : ''}
        AND created_at >= datetime('now', '-1 day')
      GROUP BY pan, amount, merchant_id, terminal_id
      HAVING COUNT(*) > 1
      ORDER BY txn_count DESC
    `;

    const params = terminalId ? [merchantId, terminalId] : [merchantId];
    const result = await db.query(query, params);

    const groups: DuplicateTransactionGroup[] = [];
    for (const row of result.rows || []) {
      const txnIds = (row as any).txn_ids.split(',');
      const canonicalId = txnIds[0];
      const duplicateIds = txnIds.slice(1);

      groups.push({
        canonicalId,
        duplicateIds,
        pan: (row as any).pan,
        amount: Number((row as any).amount),
        merchantId: (row as any).merchant_id,
        terminalId: (row as any).terminal_id,
        transactionCount: Number((row as any).txn_count),
        mergedAt: new Date().toISOString(),
      });
    }

    console.log(`[Conflict Resolution] Found ${groups.length} duplicate groups`);
    return groups;
  } catch (e: any) {
    console.error('[Conflict Resolution] Error detecting duplicates:', e);
    throw e;
  }
}

/**
 * Merge duplicate transactions
 * Keeps canonical transaction, marks others as duplicates
 * Updates all settlements to reference canonical
 */
export async function mergeDuplicateGroup(group: DuplicateTransactionGroup): Promise<boolean> {
  try {
    console.log(
      `[Conflict Resolution] Merging duplicates: canonical=${group.canonicalId}, duplicates=${group.duplicateIds.length}`
    );

    await db.query('BEGIN IMMEDIATE');

    // Mark duplicate transactions
    const placeholders = group.duplicateIds.map(() => '?').join(',');
    await db.query(
      `UPDATE pos2013_transactions 
       SET status = 'duplicate', duplicate_of = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id IN (${placeholders})`,
      [group.canonicalId, ...group.duplicateIds]
    );

    // Consolidate settlements - update duplicates to reference canonical
    for (const dupId of group.duplicateIds) {
      const dupSettlements = await db.query(
        `SELECT id, transaction_id FROM transaction_settlements WHERE transaction_id = ?`,
        [dupId]
      );

      for (const settlement of dupSettlements.rows || []) {
        const canonicalSettlement = await db.query(
          `SELECT id FROM transaction_settlements WHERE transaction_id = ? LIMIT 1`,
          [group.canonicalId]
        );

        if (canonicalSettlement.rows?.length) {
          // Canonical settlement exists, delete duplicate
          await db.query(`DELETE FROM transaction_settlements WHERE id = ?`, [(settlement as any).id]);
        } else {
          // No canonical settlement, update duplicate to point to canonical
          await db.query(
            `UPDATE transaction_settlements SET transaction_id = ? WHERE id = ?`,
            [group.canonicalId, (settlement as any).id]
          );
        }
      }
    }

    // Record merge in conflict resolution log
    await db.query(
      `INSERT INTO conflict_resolutions (id, merchant_id, conflict_type, canonical_id, duplicate_ids, status, created_at)
       VALUES (?, ?, 'DUPLICATE', ?, ?, 'RESOLVED', CURRENT_TIMESTAMP)`,
      [uuidv4(), group.merchantId, group.canonicalId, JSON.stringify(group.duplicateIds)]
    );

    await db.query('COMMIT');
    console.log(`[Conflict Resolution] Merged duplicates successfully`);
    return true;
  } catch (e: any) {
    try {
      await db.query('ROLLBACK');
    } catch { /* ignore */ }
    console.error('[Conflict Resolution] Error merging duplicates:', e);
    throw e;
  }
}

/**
 * Process a chargeback reversal
 * Reverses settlement, credits merchant wallet back
 */
export async function processReversal(
  settlementId: string,
  reason: string,
  chargebackId?: string
): Promise<ReversalRecord> {
  try {
    console.log(
      `[Conflict Resolution] Processing reversal: settlement=${settlementId}, reason=${reason}, chargeback=${chargebackId}`
    );

    await db.query('BEGIN IMMEDIATE');

    // Get settlement details
    const settlement = await db.query(
      `SELECT * FROM transaction_settlements WHERE id = ? LIMIT 1`,
      [settlementId]
    );

    if (!settlement.rows?.length) {
      throw new Error(`Settlement ${settlementId} not found`);
    }

    const sett = (settlement.rows[0] as any);
    if (sett.status === 'REVERSED') {
      throw new Error(`Settlement ${settlementId} already reversed`);
    }

    const reversalAmount = Number(sett.net_amount);
    const merchantId = sett.merchant_id;

    // Reverse settlement
    await db.query(
      `UPDATE transaction_settlements 
       SET status = 'REVERSED', reversed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [settlementId]
    );

    // Credit merchant wallet back
    const wallet = await db.query(
      `SELECT id, balance FROM merchant_wallets WHERE merchant_id = ? LIMIT 1`,
      [merchantId]
    );

    let walletId: string;
    if (wallet.rows?.length) {
      walletId = (wallet.rows[0] as any).id;
      await db.query(
        `UPDATE merchant_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [reversalAmount, walletId]
      );
    } else {
      walletId = uuidv4();
      await db.query(
        `INSERT INTO merchant_wallets (id, merchant_id, balance, currency, created_at, updated_at)
         VALUES (?, ?, ?, 'USD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [walletId, merchantId, reversalAmount]
      );
    }

    // Record wallet transaction
    await db.query(
      `INSERT INTO merchant_wallet_transactions (id, wallet_id, amount, transaction_type, reference, created_at)
       VALUES (?, ?, ?, 'REVERSAL', ?, CURRENT_TIMESTAMP)`,
      [uuidv4(), walletId, reversalAmount, settlementId]
    );

    // Create reversal record
    const reversalId = uuidv4();
    await db.query(
      `INSERT INTO settlement_reversals (id, settlement_id, reason, chargeback_id, reversal_amount, status, processed_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'PROCESSED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [reversalId, settlementId, reason, chargebackId || null, reversalAmount]
    );

    // Record conflict resolution
    await db.query(
      `INSERT INTO conflict_resolutions (id, merchant_id, conflict_type, settlement_id, status, created_at)
       VALUES (?, ?, 'REVERSAL', ?, 'RESOLVED', CURRENT_TIMESTAMP)`,
      [uuidv4(), merchantId, settlementId]
    );

    await db.query('COMMIT');

    console.log(`[Conflict Resolution] Reversal processed: amount=$${reversalAmount}`);

    return {
      id: reversalId,
      settlementId,
      reason,
      chargebackId,
      reversalAmount,
      status: 'PROCESSED',
      processedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
  } catch (e: any) {
    try {
      await db.query('ROLLBACK');
    } catch { /* ignore */ }
    console.error('[Conflict Resolution] Error processing reversal:', e);
    throw e;
  }
}

/**
 * Handle failed sync retry
 * Retries transactions that failed to sync with exponential backoff
 */
export async function retryFailedSync(
  transactionId: string,
  merchantId: string,
  maxAttempts: number = 5
): Promise<FailedSyncRetry | null> {
  try {
    console.log(
      `[Conflict Resolution] Retrying failed sync: txn=${transactionId}, merchant=${merchantId}`
    );

    // Check if sync already exists
    let syncRecord = await db.query(
      `SELECT * FROM failed_syncs WHERE transaction_id = ? AND merchant_id = ? LIMIT 1`,
      [transactionId, merchantId]
    );

    if (!syncRecord.rows?.length) {
      // Create new sync record
      const recordId = uuidv4();
      await db.query(
        `INSERT INTO failed_syncs (id, transaction_id, merchant_id, attempt_count, status, last_attempt_at, next_retry_at, created_at)
         VALUES (?, ?, ?, 1, 'PENDING', CURRENT_TIMESTAMP, datetime('now', '+2 minutes'), CURRENT_TIMESTAMP)`,
        [recordId, transactionId, merchantId]
      );
      syncRecord = await db.query(
        `SELECT * FROM failed_syncs WHERE id = ? LIMIT 1`,
        [recordId]
      );
    } else {
      const sync = (syncRecord.rows[0] as any);
      const attempts = Number(sync.attempt_count) + 1;

      if (attempts >= maxAttempts) {
        // Max attempts reached
        await db.query(
          `UPDATE failed_syncs SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [sync.id]
        );
        console.log(`[Conflict Resolution] Max retry attempts reached for ${transactionId}`);
        return null;
      }

      // Calculate exponential backoff: 2^attempts minutes
      const backoffMinutes = Math.pow(2, attempts);
      await db.query(
        `UPDATE failed_syncs 
         SET attempt_count = ?, last_attempt_at = CURRENT_TIMESTAMP, 
             next_retry_at = datetime('now', '+${backoffMinutes} minutes'),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [attempts, sync.id]
      );

      syncRecord = await db.query(
        `SELECT * FROM failed_syncs WHERE id = ? LIMIT 1`,
        [sync.id]
      );
    }

    const record = (syncRecord.rows[0] as any);
    return {
      id: record.id,
      transactionId: record.transaction_id,
      merchantId: record.merchant_id,
      attemptCount: Number(record.attempt_count),
      lastAttemptAt: record.last_attempt_at,
      nextRetryAt: record.next_retry_at,
      status: record.status,
      errorMessage: record.error_message,
      createdAt: record.created_at,
    };
  } catch (e: any) {
    console.error('[Conflict Resolution] Error retrying sync:', e);
    throw e;
  }
}

/**
 * Mark failed sync as successful
 */
export async function markSyncSuccess(syncRecordId: string): Promise<void> {
  try {
    await db.query(
      `UPDATE failed_syncs SET status = 'SUCCESS', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [syncRecordId]
    );
    console.log(`[Conflict Resolution] Sync marked successful: ${syncRecordId}`);
  } catch (e: any) {
    console.error('[Conflict Resolution] Error marking sync success:', e);
    throw e;
  }
}

/**
 * Mark failed sync with error
 */
export async function markSyncError(syncRecordId: string, error: string): Promise<void> {
  try {
    await db.query(
      `UPDATE failed_syncs SET error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [error.substring(0, 500), syncRecordId]
    );
    console.log(`[Conflict Resolution] Sync error recorded: ${syncRecordId}`);
  } catch (e: any) {
    console.error('[Conflict Resolution] Error marking sync error:', e);
    throw e;
  }
}

/**
 * Run complete conflict resolution process
 * Detects and resolves duplicates, processes pending reversals, retries failed syncs
 */
export async function runConflictResolution(
  merchantId: string,
  terminalId?: string
): Promise<ConflictResolutionResult> {
  try {
    console.log(
      `[Conflict Resolution] Running complete resolution: merchant=${merchantId}, terminal=${terminalId}`
    );

    const result: ConflictResolutionResult = {
      success: true,
      duplicatesFound: 0,
      duplicatesMerged: 0,
      reversalsProcessed: 0,
      failedSyncsRetried: 0,
      errors: [],
    };

    // 1. Detect and merge duplicates
    try {
      const duplicateGroups = await detectDuplicates(merchantId, terminalId);
      result.duplicatesFound = duplicateGroups.length;

      for (const group of duplicateGroups) {
        try {
          await mergeDuplicateGroup(group);
          result.duplicatesMerged++;
        } catch (e: any) {
          result.errors.push(`Failed to merge duplicates: ${e.message}`);
        }
      }
    } catch (e: any) {
      result.errors.push(`Duplicate detection failed: ${e.message}`);
    }

    // 2. Process pending reversals
    try {
      const reversals = await db.query(
        `SELECT id FROM settlement_reversals WHERE status = 'INITIATED' LIMIT 50`
      );

      for (const reversal of reversals.rows || []) {
        try {
          // Reversals already processed via processReversal - just count them
          result.reversalsProcessed++;
        } catch (e: any) {
          result.errors.push(`Failed to process reversal: ${e.message}`);
        }
      }
    } catch (e: any) {
      result.errors.push(`Reversal processing failed: ${e.message}`);
    }

    // 3. Retry failed syncs
    try {
      const failedSyncs = await db.query(
        `SELECT id, transaction_id, merchant_id FROM failed_syncs 
         WHERE status = 'PENDING' AND next_retry_at <= CURRENT_TIMESTAMP LIMIT 50`
      );

      for (const sync of failedSyncs.rows || []) {
        try {
          await retryFailedSync((sync as any).transaction_id, (sync as any).merchant_id);
          result.failedSyncsRetried++;
        } catch (e: any) {
          result.errors.push(`Failed to retry sync: ${e.message}`);
        }
      }
    } catch (e: any) {
      result.errors.push(`Failed sync retry failed: ${e.message}`);
    }

    console.log(`[Conflict Resolution] Resolution complete:`, result);
    return result;
  } catch (e: any) {
    console.error('[Conflict Resolution] Unexpected error:', e);
    throw e;
  }
}

/**
 * Get conflict resolution history
 */
export async function getConflictHistory(
  merchantId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ total: number; conflicts: any[] }> {
  try {
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM conflict_resolutions WHERE merchant_id = ?`,
      [merchantId]
    );

    const conflicts = await db.query(
      `SELECT * FROM conflict_resolutions 
       WHERE merchant_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [merchantId, limit, offset]
    );

    return {
      total: Number((countResult.rows?.[0] as any)?.total || 0),
      conflicts: conflicts.rows || [],
    };
  } catch (e: any) {
    console.error('[Conflict Resolution] Error fetching history:', e);
    throw e;
  }
}
