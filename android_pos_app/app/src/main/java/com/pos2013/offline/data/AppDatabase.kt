package com.pos2013.offline.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.pos2013.offline.data.dao.TransactionDao
import com.pos2013.offline.data.dao.WalletTopupDao
import com.pos2013.offline.data.model.TransactionEntity
import com.pos2013.offline.data.model.WalletTopupEntity

@Database(
    entities = [TransactionEntity::class, WalletTopupEntity::class],
    version = 5,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun transactionDao(): TransactionDao
    abstract fun walletTopupDao(): WalletTopupDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE transactions ADD COLUMN localTxnId TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE transactions ADD COLUMN txnType TEXT NOT NULL DEFAULT 'SALE'")
                db.execSQL("ALTER TABLE transactions ADD COLUMN authMode TEXT NOT NULL DEFAULT 'OFFLINE_APPROVED'")
                db.execSQL("ALTER TABLE transactions ADD COLUMN entryMode TEXT NOT NULL DEFAULT 'MANUAL'")
                db.execSQL("ALTER TABLE transactions ADD COLUMN txnTimestamp TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE transactions ADD COLUMN rrn TEXT")
                db.execSQL("ALTER TABLE transactions ADD COLUMN authCode TEXT")
            }
        }

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS wallet_topups (
                        id TEXT PRIMARY KEY NOT NULL,
                        customerId TEXT NOT NULL,
                        amountMinor INTEGER NOT NULL,
                        currency TEXT NOT NULL DEFAULT 'AED',
                        panMasked TEXT NOT NULL,
                        expiry TEXT NOT NULL DEFAULT '',
                        txnTimestamp TEXT NOT NULL,
                        authMode TEXT NOT NULL DEFAULT 'OFFLINE_APPROVED',
                        entryMode TEXT NOT NULL DEFAULT 'CHIP',
                        status TEXT NOT NULL DEFAULT 'PENDING',
                        authCode TEXT,
                        emvData TEXT,
                        syncError TEXT
                    )
                """.trimIndent())
            }
        }

        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE transactions ADD COLUMN merchantId TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE transactions ADD COLUMN terminalId TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE transactions ADD COLUMN settlementId TEXT")
                db.execSQL("ALTER TABLE transactions ADD COLUMN settlementStatus TEXT NOT NULL DEFAULT 'PENDING'")
                db.execSQL("ALTER TABLE transactions ADD COLUMN errorMessage TEXT")
            }
        }

        // v4 → v5: migrate wallet_topups.txnTimestamp from TEXT to INTEGER (Long epoch ms)
        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS wallet_topups_new (
                        id TEXT PRIMARY KEY NOT NULL,
                        customerId TEXT NOT NULL,
                        amountMinor INTEGER NOT NULL,
                        currency TEXT NOT NULL DEFAULT 'AED',
                        panMasked TEXT NOT NULL,
                        expiry TEXT NOT NULL DEFAULT '',
                        txnTimestamp INTEGER NOT NULL DEFAULT 0,
                        authMode TEXT NOT NULL DEFAULT 'OFFLINE_APPROVED',
                        entryMode TEXT NOT NULL DEFAULT 'CHIP',
                        status TEXT NOT NULL DEFAULT 'PENDING',
                        authCode TEXT,
                        emvData TEXT,
                        syncError TEXT
                    )
                """.trimIndent())
                db.execSQL("""
                    INSERT INTO wallet_topups_new
                    SELECT id, customerId, amountMinor, currency, panMasked, expiry,
                           CAST(txnTimestamp AS INTEGER), authMode, entryMode, status,
                           authCode, emvData, syncError
                    FROM wallet_topups
                """.trimIndent())
                db.execSQL("DROP TABLE wallet_topups")
                db.execSQL("ALTER TABLE wallet_topups_new RENAME TO wallet_topups")
            }
        }

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "pos_database"
                )
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5)
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
