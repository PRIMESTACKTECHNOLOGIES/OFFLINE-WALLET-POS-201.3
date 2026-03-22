package com.pos2013.offline.data.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.pos2013.offline.data.OfflineOrderManager
import com.pos2013.offline.data.PaymentRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val TAG = "SyncWorker"
        Log.d(TAG, "Background sync starting...")

        val repository = PaymentRepository(applicationContext)
        val offlineOrderManager = OfflineOrderManager(applicationContext)

        if (!repository.isNetworkAvailable()) {
            Log.d(TAG, "No network available, skipping sync.")
            return@withContext Result.retry()
        }

        try {
            // 1. Sync pending card transactions
            val txnCount = repository.getPendingCount()
            if (txnCount > 0) {
                Log.d(TAG, "Syncing $txnCount pending transactions...")
                repository.syncPendingTransactions()
            }

            // 2. Process offline orders (generate MyFatoorah links)
            val orderCount = offlineOrderManager.getPendingCount()
            if (orderCount > 0) {
                Log.d(TAG, "Processing $orderCount offline orders...")
                offlineOrderManager.processPendingOrders()
            }

            // 3. Check for paid MyFatoorah links
            val linkSentCount = offlineOrderManager.getLinkSentCount()
            if (linkSentCount > 0) {
                Log.d(TAG, "Checking payment status for $linkSentCount sent links...")
                offlineOrderManager.checkPendingPayments()
            }

            Log.d(TAG, "Background sync completed successfully.")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Error during background sync", e)
            Result.retry()
        }
    }
}