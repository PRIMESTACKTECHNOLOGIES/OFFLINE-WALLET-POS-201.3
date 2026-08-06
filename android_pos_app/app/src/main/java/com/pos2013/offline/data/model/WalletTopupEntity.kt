package com.pos2013.offline.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "wallet_topups")
data class WalletTopupEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val customerId: String,
    val amountMinor: Long,
    val currency: String = "AED",
    val panMasked: String,
    val expiry: String = "",
    val txnTimestamp: Long = System.currentTimeMillis(),
    val authMode: String = "OFFLINE_APPROVED",
    val entryMode: String = "CHIP",
    val status: String = "PENDING",
    val authCode: String? = null,
    val emvData: String? = null,
    val syncError: String? = null
)
