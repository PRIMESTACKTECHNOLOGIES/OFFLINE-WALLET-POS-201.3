import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/db';

// ───────────────────────────────────────────────────────────────────────
// AUDIT TRAIL SERVICE
// Full transaction lifecycle tracking and compliance reporting
// ───────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  transactionId: string;
  merchantId: string;
  eventType: string;
  eventCategory: 'TRANSACTION' | 'SETTLEMENT' | 'RECONCILIATION' | 'CONFLICT' | 'ADMIN';
  actor: string;
  actorType: 'SYSTEM' | 'MERCHANT' | 'ADMIN';
  previousState?: string;
  newState: string;
  details?: string;
  metadata?: string;
  createdAt: string;
}

export interface TransactionLifecycle {
  transactionId: string;
  merchantId: string;
  terminalId?: string;
  pan: string;
  amount: number;
  events: AuditEvent[];
  currentStatus: string;
  timelineUrl?: string;
}

export interface ComplianceReport {
  reportId: string;
  merchantId: string;
  period: { start: string; end: string };
  totalTransactions: number;
  totalAmount: number;
  transactionsByStatus: Record<string, number>;
  settlements: { total: number; totalAmount: number };
  reconciliations: { total: number; discrepancies: number };
  conflictResolutions: { duplicates: number; reversals: number; failedSyncs: number };
  adminActions: { total: number; types: Record<string, number> };
  complianceChecksPassed: number;
  complianceChecksFailed: number;
  createdAt: string;
}

export interface AuditFilter {
  merchantId?: string;
  transactionId?: string;
  eventType?: string;
  eventCategory?: string;
  actor?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

/**
 * Log a transaction event
 * Records any state change in a transaction's lifecycle
 */
export async function logTransactionEvent(
  transactionId: string,
  merchantId: string,
  eventType: string,
  newState: string,
  previousState?: string,
  actor: string = 'SYSTEM',
  details?: string,
  metadata?: any
): Promise<AuditEvent> {
  try {
    const eventId = uuidv4();

    await db.query(
      `INSERT INTO audit_trail (id, transaction_id, merchant_id, event_type, event_category, actor, actor_type, previous_state, new_state, details, metadata, created_at)
       VALUES (?, ?, ?, ?, 'TRANSACTION', ?, 'SYSTEM', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        eventId,
        transactionId,
        merchantId,
        eventType,
        actor,
        previousState || null,
        newState,
        details || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    console.log(
      `[Audit Trail] Transaction event logged: txn=${transactionId}, event=${eventType}, state=${newState}`
    );

    return {
      id: eventId,
      transactionId,
      merchantId,
      eventType,
      eventCategory: 'TRANSACTION',
      actor,
      actorType: 'SYSTEM',
      previousState,
      newState,
      details,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      createdAt: new Date().toISOString(),
    };
  } catch (e: any) {
    console.error('[Audit Trail] Error logging transaction event:', e);
    throw e;
  }
}

/**
 * Log a settlement event
 * Records settlement creation, processing, and status changes
 */
export async function logSettlementEvent(
  transactionId: string,
  settlementId: string,
  merchantId: string,
  eventType: string,
  newState: string,
  amount: number,
  actor: string = 'SYSTEM',
  details?: string
): Promise<AuditEvent> {
  try {
    const eventId = uuidv4();

    const metadata = {
      settlementId,
      amount,
      timestamp: new Date().toISOString(),
    };

    await db.query(
      `INSERT INTO audit_trail (id, transaction_id, merchant_id, event_type, event_category, actor, actor_type, new_state, details, metadata, created_at)
       VALUES (?, ?, ?, ?, 'SETTLEMENT', ?, 'SYSTEM', ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        eventId,
        transactionId,
        merchantId,
        eventType,
        actor,
        newState,
        details || null,
        JSON.stringify(metadata),
      ]
    );

    console.log(
      `[Audit Trail] Settlement event logged: txn=${transactionId}, settlement=${settlementId}, event=${eventType}, amount=$${amount}`
    );

    return {
      id: eventId,
      transactionId,
      merchantId,
      eventType,
      eventCategory: 'SETTLEMENT',
      actor,
      actorType: 'SYSTEM',
      newState,
      details,
      metadata: JSON.stringify(metadata),
      createdAt: new Date().toISOString(),
    };
  } catch (e: any) {
    console.error('[Audit Trail] Error logging settlement event:', e);
    throw e;
  }
}

/**
 * Log a reconciliation event
 * Records reconciliation results and discrepancies found
 */
export async function logReconciliationEvent(
  transactionId: string,
  merchantId: string,
  reportId: string,
  eventType: string,
  discrepancyType?: string,
  severity?: string,
  details?: string
): Promise<AuditEvent> {
  try {
    const eventId = uuidv4();

    const metadata = {
      reportId,
      discrepancyType,
      severity,
      timestamp: new Date().toISOString(),
    };

    await db.query(
      `INSERT INTO audit_trail (id, transaction_id, merchant_id, event_type, event_category, actor, actor_type, new_state, details, metadata, created_at)
       VALUES (?, ?, ?, ?, 'RECONCILIATION', 'SYSTEM', 'SYSTEM', ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        eventId,
        transactionId,
        merchantId,
        eventType,
        `${discrepancyType}/${severity}` || 'RECONCILED',
        details || null,
        JSON.stringify(metadata),
      ]
    );

    console.log(
      `[Audit Trail] Reconciliation event logged: txn=${transactionId}, report=${reportId}, type=${eventType}`
    );

    return {
      id: eventId,
      transactionId,
      merchantId,
      eventType,
      eventCategory: 'RECONCILIATION',
      actor: 'SYSTEM',
      actorType: 'SYSTEM',
      newState: `${discrepancyType}/${severity}` || 'RECONCILED',
      details,
      metadata: JSON.stringify(metadata),
      createdAt: new Date().toISOString(),
    };
  } catch (e: any) {
    console.error('[Audit Trail] Error logging reconciliation event:', e);
    throw e;
  }
}

/**
 * Log a conflict resolution event
 * Records duplicate merges, reversals, and failed sync retries
 */
export async function logConflictResolutionEvent(
  transactionId: string,
  merchantId: string,
  conflictType: string,
  resolutionStatus: string,
  actor: string = 'SYSTEM',
  details?: string,
  metadata?: any
): Promise<AuditEvent> {
  try {
    const eventId = uuidv4();

    await db.query(
      `INSERT INTO audit_trail (id, transaction_id, merchant_id, event_type, event_category, actor, actor_type, new_state, details, metadata, created_at)
       VALUES (?, ?, ?, ?, 'CONFLICT', ?, 'ADMIN', ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        eventId,
        transactionId,
        merchantId,
        conflictType,
        actor,
        resolutionStatus,
        details || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    console.log(
      `[Audit Trail] Conflict resolution logged: txn=${transactionId}, type=${conflictType}, status=${resolutionStatus}`
    );

    return {
      id: eventId,
      transactionId,
      merchantId,
      eventType: conflictType,
      eventCategory: 'CONFLICT',
      actor,
      actorType: 'ADMIN',
      newState: resolutionStatus,
      details,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      createdAt: new Date().toISOString(),
    };
  } catch (e: any) {
    console.error('[Audit Trail] Error logging conflict resolution:', e);
    throw e;
  }
}

/**
 * Log an admin action
 * Records manual interventions, adjustments, and approvals
 */
export async function logAdminAction(
  merchantId: string,
  actionType: string,
  targetId: string,
  admin: string,
  details?: string,
  metadata?: any
): Promise<AuditEvent> {
  try {
    const eventId = uuidv4();

    await db.query(
      `INSERT INTO audit_trail (id, transaction_id, merchant_id, event_type, event_category, actor, actor_type, new_state, details, metadata, created_at)
       VALUES (?, ?, ?, ?, 'ADMIN', ?, 'ADMIN', ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        eventId,
        targetId,
        merchantId,
        actionType,
        admin,
        actionType,
        details || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    console.log(
      `[Audit Trail] Admin action logged: merchant=${merchantId}, action=${actionType}, target=${targetId}, admin=${admin}`
    );

    return {
      id: eventId,
      transactionId: targetId,
      merchantId,
      eventType: actionType,
      eventCategory: 'ADMIN',
      actor: admin,
      actorType: 'ADMIN',
      newState: actionType,
      details,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      createdAt: new Date().toISOString(),
    };
  } catch (e: any) {
    console.error('[Audit Trail] Error logging admin action:', e);
    throw e;
  }
}

/**
 * Get complete transaction lifecycle
 * Returns all events for a transaction in chronological order
 */
export async function getTransactionAuditTrail(
  transactionId: string
): Promise<TransactionLifecycle> {
  try {
    const result = await db.query(
      `SELECT * FROM audit_trail WHERE transaction_id = ? ORDER BY created_at ASC`,
      [transactionId]
    );

    const events = result.rows || [];
    const txn = await db.query(
      `SELECT * FROM pos2013_transactions WHERE id = ? LIMIT 1`,
      [transactionId]
    );
    const txnRecord = txn.rows?.[0] as any;

    const lifecycle: TransactionLifecycle = {
      transactionId,
      merchantId: txnRecord?.merchant_id || 'unknown',
      terminalId: txnRecord?.terminal_id,
      pan: txnRecord?.pan || 'unknown',
      amount: Number(txnRecord?.amount || 0),
      events: (events as any[]).map((e: any) => ({
        id: e.id,
        transactionId: e.transaction_id,
        merchantId: e.merchant_id,
        eventType: e.event_type,
        eventCategory: e.event_category,
        actor: e.actor,
        actorType: e.actor_type,
        previousState: e.previous_state,
        newState: e.new_state,
        details: e.details,
        metadata: e.metadata,
        createdAt: e.created_at,
      })),
      currentStatus: txnRecord?.status || 'unknown',
    };

    console.log(
      `[Audit Trail] Retrieved lifecycle for ${transactionId}: ${events.length} events`
    );
    return lifecycle;
  } catch (e: any) {
    console.error('[Audit Trail] Error retrieving transaction audit trail:', e);
    throw e;
  }
}

/**
 * Generate compliance report
 * Aggregates transaction and settlement data for compliance
 */
export async function generateComplianceReport(
  merchantId: string,
  dateFrom: string,
  dateTo: string
): Promise<ComplianceReport> {
  try {
    console.log(
      `[Audit Trail] Generating compliance report: merchant=${merchantId}, period=${dateFrom} to ${dateTo}`
    );

    const reportId = uuidv4();

    // Count transactions by status
    const txnsByStatus = await db.query(
      `SELECT status, COUNT(*) as count, SUM(amount) as total
       FROM pos2013_transactions
       WHERE merchant_id = ? AND created_at BETWEEN ? AND ?
       GROUP BY status`,
      [merchantId, dateFrom, dateTo]
    );

    const txnStatusMap: Record<string, number> = {};
    let totalTxns = 0;
    let totalTxnAmount = 0;
    for (const row of txnsByStatus.rows || []) {
      const status = (row as any).status;
      const count = Number((row as any).count);
      const total = Number((row as any).total || 0);
      txnStatusMap[status] = count;
      totalTxns += count;
      totalTxnAmount += total;
    }

    // Count settlements
    const settlements = await db.query(
      `SELECT COUNT(*) as count, SUM(net_amount) as total
       FROM transaction_settlements
       WHERE merchant_id = ? AND status = 'SETTLED' AND created_at BETWEEN ? AND ?`,
      [merchantId, dateFrom, dateTo]
    );
    const settlementCount = Number((settlements.rows?.[0] as any)?.count || 0);
    const settlementAmount = Number((settlements.rows?.[0] as any)?.total || 0);

    // Count reconciliations
    const reconciliations = await db.query(
      `SELECT COUNT(*) as count FROM reconciliation_reports
       WHERE merchant_id = ? AND created_at BETWEEN ? AND ?`,
      [merchantId, dateFrom, dateTo]
    );
    const reconCount = Number((reconciliations.rows?.[0] as any)?.count || 0);

    // Count discrepancies
    const discrepancies = await db.query(
      `SELECT COUNT(*) as count FROM reconciliation_discrepancies
       WHERE created_at BETWEEN ? AND ?`,
      [dateFrom, dateTo]
    );
    const discrepancyCount = Number((discrepancies.rows?.[0] as any)?.count || 0);

    // Count conflict resolutions by type
    const conflicts = await db.query(
      `SELECT conflict_type, COUNT(*) as count
       FROM conflict_resolutions
       WHERE merchant_id = ? AND created_at BETWEEN ? AND ?
       GROUP BY conflict_type`,
      [merchantId, dateFrom, dateTo]
    );
    let duplicateCount = 0;
    let reversalCount = 0;
    let failedSyncCount = 0;
    for (const row of conflicts.rows || []) {
      const type = (row as any).conflict_type;
      const count = Number((row as any).count);
      if (type === 'DUPLICATE') duplicateCount = count;
      else if (type === 'REVERSAL') reversalCount = count;
      else if (type === 'FAILED_SYNC') failedSyncCount = count;
    }

    // Count admin actions
    const adminActions = await db.query(
      `SELECT event_type, COUNT(*) as count
       FROM audit_trail
       WHERE merchant_id = ? AND event_category = 'ADMIN' AND created_at BETWEEN ? AND ?
       GROUP BY event_type`,
      [merchantId, dateFrom, dateTo]
    );
    let totalAdminActions = 0;
    const adminActionTypes: Record<string, number> = {};
    for (const row of adminActions.rows || []) {
      const type = (row as any).event_type;
      const count = Number((row as any).count);
      adminActionTypes[type] = count;
      totalAdminActions += count;
    }

    // Compliance checks (basic)
    const complianceChecksPassed =
      settlementCount > 0 ? settlementCount : 0 + reconCount > 0 ? reconCount : 0;
    const complianceChecksFailed =
      discrepancyCount > 0 ? discrepancyCount : 0 + reversalCount > 0 ? reversalCount : 0;

    const report: ComplianceReport = {
      reportId,
      merchantId,
      period: { start: dateFrom, end: dateTo },
      totalTransactions: totalTxns,
      totalAmount: totalTxnAmount,
      transactionsByStatus: txnStatusMap,
      settlements: { total: settlementCount, totalAmount: settlementAmount },
      reconciliations: { total: reconCount, discrepancies: discrepancyCount },
      conflictResolutions: {
        duplicates: duplicateCount,
        reversals: reversalCount,
        failedSyncs: failedSyncCount,
      },
      adminActions: { total: totalAdminActions, types: adminActionTypes },
      complianceChecksPassed,
      complianceChecksFailed,
      createdAt: new Date().toISOString(),
    };

    // Store report
    await db.query(
      `INSERT INTO compliance_reports (id, merchant_id, report_date, period_start, period_end, total_transactions, total_amount, summary_json, created_at)
       VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [reportId, merchantId, dateFrom, dateTo, totalTxns, totalTxnAmount, JSON.stringify(report)]
    );

    console.log(
      `[Audit Trail] Compliance report generated: ${reportId}, txns=${totalTxns}, settlements=${settlementCount}`
    );

    return report;
  } catch (e: any) {
    console.error('[Audit Trail] Error generating compliance report:', e);
    throw e;
  }
}

/**
 * Query audit trail with filters
 * Paginated search across audit events
 */
export async function queryAuditTrail(filter: AuditFilter): Promise<{ total: number; events: AuditEvent[] }> {
  try {
    let whereClause = '1=1';
    const params: any[] = [];

    if (filter.merchantId) {
      whereClause += ' AND merchant_id = ?';
      params.push(filter.merchantId);
    }
    if (filter.transactionId) {
      whereClause += ' AND transaction_id = ?';
      params.push(filter.transactionId);
    }
    if (filter.eventType) {
      whereClause += ' AND event_type = ?';
      params.push(filter.eventType);
    }
    if (filter.eventCategory) {
      whereClause += ' AND event_category = ?';
      params.push(filter.eventCategory);
    }
    if (filter.actor) {
      whereClause += ' AND actor = ?';
      params.push(filter.actor);
    }
    if (filter.dateFrom) {
      whereClause += ' AND created_at >= ?';
      params.push(filter.dateFrom);
    }
    if (filter.dateTo) {
      whereClause += ' AND created_at <= ?';
      params.push(filter.dateTo);
    }

    // Get total count
    const countResult = await db.query(`SELECT COUNT(*) as total FROM audit_trail WHERE ${whereClause}`, params);
    const total = Number((countResult.rows?.[0] as any)?.total || 0);

    // Get paginated results
    const limit = Math.min(filter.limit || 50, 500);
    const offset = filter.offset || 0;

    const result = await db.query(
      `SELECT * FROM audit_trail WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const events = (result.rows || []).map((e: any) => ({
      id: e.id,
      transactionId: e.transaction_id,
      merchantId: e.merchant_id,
      eventType: e.event_type,
      eventCategory: e.event_category,
      actor: e.actor,
      actorType: e.actor_type,
      previousState: e.previous_state,
      newState: e.new_state,
      details: e.details,
      metadata: e.metadata,
      createdAt: e.created_at,
    }));

    console.log(`[Audit Trail] Query returned ${events.length} events (total: ${total})`);
    return { total, events };
  } catch (e: any) {
    console.error('[Audit Trail] Error querying audit trail:', e);
    throw e;
  }
}

/**
 * Get compliance report
 */
export async function getComplianceReport(reportId: string): Promise<any> {
  try {
    const result = await db.query(
      `SELECT * FROM compliance_reports WHERE id = ? LIMIT 1`,
      [reportId]
    );

    if (!result.rows?.length) {
      throw new Error(`Compliance report ${reportId} not found`);
    }

    const report = result.rows[0] as any;
    const summary = report.summary_json ? JSON.parse(report.summary_json) : {};

    return {
      id: report.id,
      merchantId: report.merchant_id,
      reportDate: report.report_date,
      period: { start: report.period_start, end: report.period_end },
      totalTransactions: report.total_transactions,
      totalAmount: report.total_amount,
      summary,
      createdAt: report.created_at,
    };
  } catch (e: any) {
    console.error('[Audit Trail] Error retrieving compliance report:', e);
    throw e;
  }
}
