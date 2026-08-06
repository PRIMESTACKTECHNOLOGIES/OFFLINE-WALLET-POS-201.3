export type TransactionState = 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'SETTLED' | 'REVERSED' | 'FAILED';

export interface LedgerEntry {
  id: string;
  transactionId: string;
  type: 'credit' | 'debit';
  amount: number;
  currency: string;
  status: TransactionState;
  description: string;
  createdAt: string;
}

const allowedTransitions: Record<TransactionState, TransactionState[]> = {
  PENDING: ['AUTHORIZED', 'FAILED'],
  AUTHORIZED: ['CAPTURED', 'REVERSED', 'FAILED'],
  CAPTURED: ['SETTLED', 'REVERSED', 'FAILED'],
  SETTLED: ['REVERSED'],
  REVERSED: [],
  FAILED: [],
};

export function validateTransition(current: TransactionState, next: TransactionState): void {
  if (current === next) {
    return;
  }

  if (!allowedTransitions[current]?.includes(next)) {
    throw new Error(`Invalid transition from ${current} to ${next}`);
  }
}

export function createLedgerEntry(transactionId: string, type: 'credit' | 'debit', amount: number, currency: string, status: TransactionState, description: string): LedgerEntry {
  return {
    id: `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    transactionId,
    type,
    amount,
    currency,
    status,
    description,
    createdAt: new Date().toISOString(),
  };
}

export async function persistLedgerEntry(entry: LedgerEntry, query: (text: string, params?: any[]) => Promise<any> = async () => { throw new Error('No query function provided'); }) {
  await query(
    `INSERT INTO ledger_entries (id, transaction_id, type, amount, currency, status, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, entry.transactionId, entry.type, entry.amount, entry.currency, entry.status, entry.description, entry.createdAt]
  );
}
