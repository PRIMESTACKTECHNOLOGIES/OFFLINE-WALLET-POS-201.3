package com.pos2013.offline

import android.app.Application
import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.pos2013.offline.data.AppDatabase
import com.pos2013.offline.data.api.ApiClient
import com.pos2013.offline.workers.SyncWorker
import java.util.concurrent.TimeUnit

class PosApplication : Application() {

    val database: AppDatabase by lazy { AppDatabase.getDatabase(this) }

    override fun onCreate() {
        super.onCreate()
        scheduleSyncWorker()
    }

    private fun scheduleSyncWorker() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "POS_SYNC_WORKER",
            ExistingPeriodicWorkPolicy.KEEP,
            syncRequest
        )
    }

    companion object {
        /** Read server URL from SharedPrefs — falls back to emulator default */
        fun getServerUrl(context: Context): String {
            val prefs = context.getSharedPreferences("pos_settings", Context.MODE_PRIVATE)
            return prefs.getString("server_url", ApiClient.DEFAULT_URL) ?: ApiClient.DEFAULT_URL
        }

        /** Read stored JWT token (null if not logged in yet) */
        fun getJwtToken(context: Context): String? {
            val prefs = context.getSharedPreferences("pos_settings", Context.MODE_PRIVATE)
            return prefs.getString("jwt_token", null)
        }

        /** Persist JWT token after successful login */
        fun saveJwtToken(context: Context, token: String) {
            context.getSharedPreferences("pos_settings", Context.MODE_PRIVATE)
                .edit().putString("jwt_token", token).apply()
        }

        /** Clear JWT token on logout */
        fun clearJwtToken(context: Context) {
            context.getSharedPreferences("pos_settings", Context.MODE_PRIVATE)
                .edit().remove("jwt_token").apply()
        }

        fun isLoggedIn(context: Context): Boolean = !getJwtToken(context).isNullOrBlank()
    }
}
