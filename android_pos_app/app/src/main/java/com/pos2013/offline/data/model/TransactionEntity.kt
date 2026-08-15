package com.pos2013.offline.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val merchantId: String,
    val terminalId: String,
    val localTxnId: String = UUID.randomUUID().toString(),
    val stan: String,
    val amountMinor: Long,
    val currency: String = "AED",
    val panMasked: String,
    val expiry: String = "",
    val txnType: String = "SALE",
    val authMode: String = "OFFLINE_APPROVED",
    val entryMode: String = "MANUAL",
    val txnTimestamp: Long = System.currentTimeMillis(),
    val rrn: String? = null,
    val authCode: String? = null,
    val settlementId: String? = null,
    val settlementStatus: String = "PENDING",
    val errorMessage: String? = null,
    val status: String = "PENDING"
)
