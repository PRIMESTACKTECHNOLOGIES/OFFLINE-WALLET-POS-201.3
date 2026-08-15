import { db } from '../../config/db';
import { walletsService } from '../wallets/wallets.service';
import { v4 as uuidv4 } from 'uuid';
import { createLedgerEntry, validateTransition, persistLedgerEntry } from '../ledger/ledger.service';

export async function debitMerchantWallet(merchantId: string, amount: number, reason: string, reference?: string, meta?: any) {
  if (amount <= 0) throw new Error('Amount must be positive');

  // Use explicit transaction
  await db.query('BEGIN IMMEDIATE');
  try {
    const wallet = await walletsService.getOrCreateMerchantWallet(merchantId);

    const balRes = await db.query('SELECT balance FROM merchant_wallets WHERE id = ?', [wallet.id]);
    const balance = Number(balRes.rows[0]?.balance ?? 0);
    if (balance < amount) {
      await db.query('ROLLBACK');
      throw new Error('Insufficient balance');
    }

    await db.query('UPDATE merchant_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, wallet.id]);

    // ledger entry
    const txnId = uuidv4();
    const ledgerEntry = createLedgerEntry(txnId, 'debit', amount, 'USD', 'AUTHORIZED', reason || 'merchant_payout');
    validateTransition('PENDING', ledgerEntry.status as any);
    await persistLedgerEntry(ledgerEntry, db.query.bind(db));

    await db.query('COMMIT');
    return { success: true, transactionId: txnId };
  } catch (e) {
    try { await db.query('ROLLBACK'); } catch (err) { /* ignore */ }
    throw e;
  }
}

/** Reverse a prior debit (e.g. when external network payout fails) — mirrors debitMerchantWallet. */
export async function creditMerchantWallet(merchantId: string, amount: number, reason: string, reference?: string, meta?: any) {
  if (amount <= 0) throw new Error('Amount must be positive');
  await db.query('BEGIN IMMEDIATE');
  try {
    const wallet = await walletsService.getOrCreateMerchantWallet(merchantId);
    await db.query('UPDATE merchant_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, wallet.id]);
    const txnId = uuidv4();
    const ledgerEntry = createLedgerEntry(txnId, 'credit', amount, 'USD', 'AUTHORIZED', reason || 'merchant_payout_reversal');
    validateTransition('PENDING', ledgerEntry.status as any);
    await persistLedgerEntry(ledgerEntry, db.query.bind(db));
    await db.query('COMMIT');
    return { success: true, transactionId: txnId };
  } catch (e) {
    try { await db.query('ROLLBACK'); } catch (err) { /* ignore */ }
    throw e;
  }
}

export default { debitMerchantWallet, creditMerchantWallet };
