package com.pos2013.offline.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.pos2013.offline.data.model.TransactionEntity

@Dao
interface TransactionDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(transaction: TransactionEntity)

    @Query("SELECT * FROM transactions WHERE status = :status ORDER BY txnTimestamp ASC")
    suspend fun getByStatus(status: String): List<TransactionEntity>

    @Query("SELECT * FROM transactions ORDER BY txnTimestamp DESC LIMIT :limit")
    suspend fun getRecent(limit: Int = 50): List<TransactionEntity>

    @Query("SELECT COUNT(*) FROM transactions WHERE status = :status")
    suspend fun countByStatus(status: String): Int

    @Query("UPDATE transactions SET status = :newStatus WHERE id IN (:ids)")
    suspend fun updateStatus(ids: List<String>, newStatus: String): Int

    @Query("UPDATE transactions SET status = 'SYNCED', settlementStatus = 'SETTLED' WHERE id = :id")
    suspend fun markSynced(id: String): Int

    @Query("DELETE FROM transactions WHERE status = 'SYNCED'")
    suspend fun purgeSynced(): Int
}
