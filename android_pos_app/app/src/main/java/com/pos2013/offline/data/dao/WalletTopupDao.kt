
package com.pos2013.offline.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.pos2013.offline.data.model.WalletTopupEntity

@Dao
interface WalletTopupDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(topup: WalletTopupEntity)

    @Query("SELECT * FROM wallet_topups WHERE status = 'PENDING' ORDER BY txnTimestamp ASC")
    suspend fun getPendingTopups(): List<WalletTopupEntity>

    @Query("SELECT COUNT(*) FROM wallet_topups WHERE status = 'PENDING'")
    suspend fun countPendingTopups(): Int

    @Query("UPDATE wallet_topups SET status = 'SYNCED', authCode = :authCode WHERE id = :id")
    suspend fun markSynced(id: String, authCode: String?)

    @Query("UPDATE wallet_topups SET status = 'FAILED', syncError = :error WHERE id = :id")
    suspend fun markFailed(id: String, error: String)

    @Query("DELETE FROM wallet_topups WHERE status = 'SYNCED'")
    suspend fun purgeSynced()
}
