package com.pos2013.offline.workers

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.pos2013.offline.PosApplication
import com.pos2013.offline.data.AppDatabase
import com.pos2013.offline.data.TransactionRepository
import com.pos2013.offline.data.api.ApiClient

class SyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "SyncWorker"
        const val KEY_COUNT = "count"
    }

    override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences("pos_settings", Context.MODE_PRIVATE)
        val serverUrl  = prefs.getString("server_url",   ApiClient.DEFAULT_URL) ?: ApiClient.DEFAULT_URL
        val merchantId = prefs.getString("merchant_id",  "MERCHANT123")         ?: "MERCHANT123"
        val terminalId = prefs.getString("terminal_id",  "TERM001")             ?: "TERM001"
        val jwtToken   = PosApplication.getJwtToken(applicationContext)

        return try {
            val db         = AppDatabase.getDatabase(applicationContext)
            val api        = ApiClient.createPayment2013Api(serverUrl, jwtToken)
            val walletsApi = ApiClient.createWalletsApi(serverUrl, jwtToken)

            val repo = TransactionRepository(
                dao           = db.transactionDao(),
                walletTopupDao = db.walletTopupDao(),
                api           = api,
                walletsApi    = walletsApi,
                merchantId    = merchantId,
                terminalId    = terminalId
            )

            val result = repo.syncPendingTransactions()

            if (result.success) {
                Log.i(TAG, "Sync OK — txns=${result.count} walletTopups=${result.walletTopupsSynced}")
                Result.success(workDataOf(KEY_COUNT to result.count))
            } else {
                Log.w(TAG, "Sync failed: ${result.errorMessage}")
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Sync exception", e)
            Result.retry()
        }
    }
}
