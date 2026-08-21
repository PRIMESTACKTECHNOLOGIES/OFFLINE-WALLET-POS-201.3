/**
 * deferredBroadcast.worker.ts
 *
 * Retry daemon for on-chain withdrawals that couldn't broadcast immediately
 * because the hot/treasury wallet had insufficient USDT balance.
 *
 * Runs every RETRY_INTERVAL_MS (default 5 minutes) and retries all rows
 * with status = 'deferred_broadcast' in both:
 *   • customer_crypto_withdrawals  (customer self-serve withdrawals)
 *   • merchant_crypto_withdrawals  (merchant payout router)
 *
 * On success  → updates status to 'completed', stores tx_id + tx_url.
 * On gas fail → leaves status as 'deferred_broadcast' (will retry next cycle).
 * On hard fail → updates status to 'pending_manual' (human action needed).
 *
 * START: call startDeferredBroadcastWorker() once from server.ts.
 * STOP:  call stopDeferredBroadcastWorker() for graceful shutdown.
 */

import { db } from '../config/db';

const RETRY_INTERVAL_MS = parseInt(process.env.DEFERRED_RETRY_INTERVAL_MS || '300000'); // 5 min default
const MAX_ATTEMPTS      = parseInt(process.env.DEFERRED_MAX_ATTEMPTS || '48');           // ~4 hours @ 5 min
let   timer: ReturnType<typeof setInterval> | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[DeferredBroadcast] ${new Date().toISOString()} ${msg}`);
}

function parseAttempts(meta: string | null): number {
  try { return Number(JSON.parse(meta || '{}').retry_attempts || 0); } catch { return 0; }
}

// ── Customer withdrawal retry ─────────────────────────────────────────────────

async function retryCustomerWithdrawals(): Promise<void> {
  const rows = await db.query(
    `SELECT * FROM customer_crypto_withdrawals
     WHERE status = 'deferred_broadcast'
     ORDER BY created_at ASC
     LIMIT 50`
  );

  for (const row of rows.rows) {
    const attempts = parseAttempts(row.meta);
    if (attempts >= MAX_ATTEMPTS) {
      log(`Customer withdrawal ${row.id}: max attempts reached → pending_manual`);
      await db.query(
        `UPDATE customer_crypto_withdrawals
         SET status = 'pending_manual', updated_at = CURRENT_TIMESTAMP,
             meta = json_patch(COALESCE(meta,'{}'), '{"auto_escalated":true,"retry_attempts":${attempts}}')
         WHERE id = ?`,
        [row.id]
      );
      continue;
    }

    log(`Retrying customer withdrawal ${row.id}: ${row.amount} ${row.coin} → ${row.destination_address} (attempt ${attempts + 1})`);

    try {
      const xr = await import('../exchange/exchange-router.service');
      const directRail = await xr.detectDirectRailForDestination(row.destination_address, row.network);

      if (!directRail) {
        log(`  No direct rail for ${row.destination_address} — skipping`);
        continue;
      }

      const result = await xr.directRailWithdraw(directRail, row.coin, row.destination_address, Number(row.amount), {
        senderMode: 'auto',
      });

      if (result.deferred) {
        // Still not enough balance — increment counter and wait for next cycle
        await db.query(
          `UPDATE customer_crypto_withdrawals
           SET updated_at = CURRENT_TIMESTAMP,
               meta = json_patch(COALESCE(meta,'{}'), '{"retry_attempts":${attempts + 1},"last_retry":"${new Date().toISOString()}"}')
           WHERE id = ?`,
          [row.id]
        );
        log(`  Still deferred — wallet balance insufficient. Will retry.`);
      } else if (result.ok && result.txId) {
        await db.query(
          `UPDATE customer_crypto_withdrawals
           SET status = 'completed', tx_id = ?, tx_url = ?, provider = ?,
               updated_at = CURRENT_TIMESTAMP,
               meta = json_patch(COALESCE(meta,'{}'), '{"retry_attempts":${attempts + 1},"completed_by_daemon":true}')
           WHERE id = ?`,
          [result.txId, result.txUrl || null, String(result.provider || directRail), row.id]
        );
        log(`  ✅ Completed: txId=${result.txId}`);
      } else {
        await db.query(
          `UPDATE customer_crypto_withdrawals
           SET status = 'pending_manual', updated_at = CURRENT_TIMESTAMP,
               meta = json_patch(COALESCE(meta,'{}'), '{"retry_attempts":${attempts + 1},"daemon_error":"broadcast returned no txId"}')
           WHERE id = ?`,
          [row.id]
        );
        log(`  ⚠ Broadcast returned no txId → pending_manual`);
      }
    } catch (err: any) {
      const errMsg = String(err?.message || err).slice(0, 200);
      const isGasError = errMsg.toLowerCase().includes('trx') || errMsg.toLowerCase().includes('bnb') ||
                         errMsg.toLowerCase().includes('matic') || errMsg.toLowerCase().includes('gas');

      if (isGasError) {
        // Gas problem — keep deferred, operator needs to top up native token
        await db.query(
          `UPDATE customer_crypto_withdrawals
           SET updated_at = CURRENT_TIMESTAMP,
               meta = json_patch(COALESCE(meta,'{}'), '{"retry_attempts":${attempts + 1},"gas_error":true,"last_error":${JSON.stringify(errMsg)}}')
           WHERE id = ?`,
          [row.id]
        );
        log(`  Gas error (keep deferred): ${errMsg}`);
      } else {
        await db.query(
          `UPDATE customer_crypto_withdrawals
           SET status = 'pending_manual', updated_at = CURRENT_TIMESTAMP,
               meta = json_patch(COALESCE(meta,'{}'), '{"retry_attempts":${attempts + 1},"daemon_error":${JSON.stringify(errMsg)}}')
           WHERE id = ?`,
          [row.id]
        );
        log(`  Hard error → pending_manual: ${errMsg}`);
      }
    }
  }
}

// ── Merchant withdrawal retry ─────────────────────────────────────────────────

async function retryMerchantWithdrawals(): Promise<void> {
  const rows = await db.query(
    `SELECT * FROM merchant_crypto_withdrawals
     WHERE status = 'deferred_broadcast'
     ORDER BY created_at ASC
     LIMIT 50`
  );

  for (const row of rows.rows) {
    const attempts = parseAttempts(row.meta);
    if (attempts >= MAX_ATTEMPTS) {
      log(`Merchant withdrawal ${row.id}: max attempts reached → pending_manual`);
      await db.query(
        `UPDATE merchant_crypto_withdrawals
         SET status = 'pending_manual', updated_at = CURRENT_TIMESTAMP,
             meta = json_patch(COALESCE(meta,'{}'), '{"auto_escalated":true,"retry_attempts":${attempts}}')
         WHERE id = ?`,
        [row.id]
      );
      continue;
    }

    log(`Retrying merchant withdrawal ${row.id}: ${row.amount_usd} ${row.asset} → ${row.address} (attempt ${attempts + 1})`);

    try {
      const xr = await import('../exchange/exchange-router.service');
      const directRail = await xr.detectDirectRailForDestination(row.address, row.network);

      if (!directRail) {
        log(`  No direct rail for ${row.address} — skipping`);
        continue;
      }

      const result = await xr.directRailWithdraw(directRail, row.asset, row.address, Number(row.amount_usd), {
        senderMode: 'auto',
      });

      if (result.deferred) {
        await db.query(
          `UPDATE merchant_crypto_withdrawals
           SET updated_at = CURRENT_TIMESTAMP,
               meta = json_patch(COALESCE(meta,'{}'), '{"retry_attempts":${attempts + 1},"last_retry":"${new Date().toISOString()}"}')
           WHERE id = ?`,
          [row.id]
        );
        log(`  Still deferred — will retry next cycle.`);
      } else if (result.ok && result.txId) {
        await db.query(
          `UPDATE merchant_crypto_withdrawals
           SET status = 'completed', tx_id = ?, tx_url = ?, provider = ?,
               updated_at = CURRENT_TIMESTAMP,
               meta = json_patch(COALESCE(meta,'{}'), '{"retry_attempts":${attempts + 1},"completed_by_daemon":true}')
           WHERE id = ?`,
          [result.txId, result.txUrl || null, String(result.provider || directRail), row.id]
        );
        log(`  ✅ Completed: txId=${result.txId}`);
      } else {
        await db.query(
          `UPDATE merchant_crypto_withdrawals
           SET status = 'pending_manual', updated_at = CURRENT_TIMESTAMP,
               meta = json_patch(COALESCE(meta,'{}'), '{"retry_attempts":${attempts + 1},"daemon_error":"no txId returned"}')
           WHERE id = ?`,
          [row.id]
        );
        log(`  ⚠ No txId returned → pending_manual`);
      }
    } catch (err: any) {
      const errMsg = String(err?.message || err).slice(0, 200);
      const isGasError = errMsg.toLowerCase().includes('trx') || errMsg.toLowerCase().includes('bnb') ||
                         errMsg.toLowerCase().includes('matic') || errMsg.toLowerCase().includes('gas');

      if (isGasError) {
        await db.query(
          `UPDATE merchant_crypto_withdrawals
           SET updated_at = CURRENT_TIMESTAMP,
               meta = json_patch(COALESCE(meta,'{}'), '{"retry_attempts":${attempts + 1},"gas_error":true,"last_error":${JSON.stringify(errMsg)}}')
           WHERE id = ?`,
          [row.id]
        );
        log(`  Gas error (keep deferred): ${errMsg}`);
      } else {
        await db.query(
          `UPDATE merchant_crypto_withdrawals
           SET status = 'pending_manual', updated_at = CURRENT_TIMESTAMP,
               meta = json_patch(COALESCE(meta,'{}'), '{"retry_attempts":${attempts + 1},"daemon_error":${JSON.stringify(errMsg)}}')
           WHERE id = ?`,
          [row.id]
        );
        log(`  Hard error → pending_manual: ${errMsg}`);
      }
    }
  }
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  try {
    await retryCustomerWithdrawals();
    await retryMerchantWithdrawals();
  } catch (err: any) {
    console.error('[DeferredBroadcast] Tick error:', err?.message || err);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startDeferredBroadcastWorker(): void {
  if (timer) return; // already running
  log(`Started. Retry interval: ${RETRY_INTERVAL_MS / 1000}s, max attempts: ${MAX_ATTEMPTS}`);
  // Run once immediately on startup (catches any rows left from a previous deploy)
  tick();
  timer = setInterval(tick, RETRY_INTERVAL_MS);
}

export function stopDeferredBroadcastWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    log('Stopped.');
  }
}
