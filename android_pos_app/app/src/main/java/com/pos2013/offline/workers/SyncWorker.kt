package com.pos2013.offline.workers

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.ListenableWorker.Result
import com.pos2013.offline.config.GatewayConfig
import com.pos2013.offline.data.PaymentRepository

class SyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        // Refresh config from preferences
        GatewayConfig.refreshFromPreferences(applicationContext)
        
        val repo = PaymentRepository(applicationContext)

        return try {
            val summary = repo.syncPendingTransactions()
            if (summary.failed == 0) {
                Result.success()
            } else {
                Result.retry()
            }
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
