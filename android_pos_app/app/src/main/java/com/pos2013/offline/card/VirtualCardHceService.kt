
package com.pos2013.offline.card

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.util.Log
import java.util.Locale

class VirtualCardHceService : HostApduService() {
    companion object {
        private const val TAG = "VirtualCardHceService"

        // Our custom AID for virtual wallet card
        private val AID_VIRTUAL_WALLET = byteArrayOf(
            0xF0.toByte(), 0x39.toByte(), 0x41.toByte(), 0x48.toByte(),
            0x34.toByte(), 0x10.toByte(), 0x10.toByte()
        )

        // Standard SELECT AID APDU
        private const val SELECT_APDU_HEADER = "00A40400"

        // Success status word
        private val SW_SUCCESS = byteArrayOf(0x90.toByte(), 0x00.toByte())
        private val SW_UNKNOWN = byteArrayOf(0x6F.toByte(), 0x00.toByte())
        private val SW_FILE_NOT_FOUND = byteArrayOf(0x6A.toByte(), 0x82.toByte())
        private val SW_CLA_NOT_SUPPORTED = byteArrayOf(0x6E.toByte(), 0x00.toByte())
    }

    // Virtual card data (you'd load this from secure storage in production)
    private val virtualPan = "1234567890123456"
    private val virtualExpiry = "2512" // YYMM
    private val virtualCardHolder = "MERCHANT WALLET"

    override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
        Log.d(TAG, "Received APDU: ${toHexString(commandApdu)}")

        // Check if it's a SELECT AID command
        if (commandApdu.size >= 5) {
            val header = commandApdu.copyOfRange(0, 4)
            val aidLength = commandApdu[4].toInt() and 0xFF
            if (toHexString(header).equals(SELECT_APDU_HEADER, ignoreCase = true)
                && commandApdu.size >= 5 + aidLength) {
                val aid = commandApdu.copyOfRange(5, 5 + aidLength)
                if (aid.contentEquals(AID_VIRTUAL_WALLET)) {
                    Log.d(TAG, "SELECT AID successful")
                    // Return FCI (File Control Information)
                    return buildFciResponse() + SW_SUCCESS
                } else {
                    Log.d(TAG, "AID not found: ${toHexString(aid)}")
                    return SW_FILE_NOT_FOUND
                }
            }
        }

        // Handle GET PROCESSING OPTIONS
        if (commandApdu.size >= 4 && commandApdu[0] == 0x80.toByte() && commandApdu[1] == 0xA8.toByte()) {
            Log.d(TAG, "GET PROCESSING OPTIONS")
            // Return dummy AFL (Application File Locator)
            return byteArrayOf(0x83.toByte(), 0x02.toByte(), 0x01.toByte(), 0x01.toByte()) + SW_SUCCESS
        }

        // Handle READ RECORD commands
        if (commandApdu.size >= 5 && commandApdu[0] == 0x00.toByte() && commandApdu[1] == 0xB2.toByte()) {
            val recordNumber = commandApdu[2].toInt() and 0xFF
            Log.d(TAG, "READ RECORD $recordNumber")
            return readRecord(recordNumber)
        }

        // Default: unknown command
        Log.d(TAG, "Unknown command")
        return SW_UNKNOWN
    }

    private fun buildFciResponse(): ByteArray {
        // Simplified FCI response
        val fci = mutableListOf<Byte>()

        // FCI template
        fci.add(0x6F.toByte())
        fci.add(0x25.toByte())

        // DF name (AID)
        fci.add(0x84.toByte())
        fci.add(AID_VIRTUAL_WALLET.size.toByte())
        fci.addAll(AID_VIRTUAL_WALLET.toList())

        // FCI proprietary template
        fci.add(0xA5.toByte())
        fci.add(0x18.toByte())

        // Application label
        fci.add(0x50.toByte())
        fci.add(0x0C.toByte())
        fci.addAll("VIRTUAL WALLET".toByteArray(Charsets.US_ASCII).toList())

        // Language preference
        fci.add(0x5F2D.toByte())
        fci.add(0x02.toByte())
        fci.addAll("en".toByteArray(Charsets.US_ASCII).toList())

        // Issuer code table index
        fci.add(0x9F11.toByte())
        fci.add(0x01.toByte())
        fci.add(0x01.toByte())

        return fci.toByteArray()
    }

    private fun readRecord(recordNumber: Int): ByteArray {
        val record = when (recordNumber) {
            1 -> {
                // Record 1: Track 2 Equivalent Data
                val track2 = buildTrack2Equivalent()
                val track2Bytes = hexStringToByteArray(track2)
                val recordBytes = mutableListOf<Byte>()
                recordBytes.add(0x57.toByte())
                recordBytes.add(track2Bytes.size.toByte())
                recordBytes.addAll(track2Bytes.toList())
                recordBytes.toByteArray()
            }
            2 -> {
                // Record 2: Cardholder Name
                val nameBytes = virtualCardHolder.toByteArray(Charsets.US_ASCII)
                val recordBytes = mutableListOf<Byte>()
                recordBytes.add(0x5F20.toByte())
                recordBytes.add(nameBytes.size.toByte())
                recordBytes.addAll(nameBytes.toList())
                recordBytes.toByteArray()
            }
            3 -> {
                // Record 3: Application Expiration Date, Application Effective Date
                val recordBytes = mutableListOf<Byte>()
                // Expiry (YYMM)
                recordBytes.add(0x5F24.toByte())
                recordBytes.add(0x02.toByte())
                recordBytes.addAll(hexStringToByteArray(virtualExpiry).toList())
                // Effective date (YYMM)
                recordBytes.add(0x5F25.toByte())
                recordBytes.add(0x02.toByte())
                recordBytes.addAll(hexStringToByteArray("2401").toList())
                recordBytes.toByteArray()
            }
            else -> {
                byteArrayOf()
            }
        }

        return if (record.isNotEmpty()) {
            record + SW_SUCCESS
        } else {
            SW_FILE_NOT_FOUND
        }
    }

    private fun buildTrack2Equivalent(): String {
        // Track 2 format: PAN=YYMMDD123456789012345
        // DD is service code
        val pan = virtualPan
        val expiry = virtualExpiry
        val serviceCode = "101" // Standard service code
        val discretionary = "0000000000000000000"
        return "$pan=$expiry$serviceCode$discretionary"
    }

    override fun onDeactivated(reason: Int) {
        Log.d(TAG, "Deactivated: $reason")
    }

    private fun toHexString(bytes: ByteArray): String {
        return bytes.joinToString("") { "%02X".format(it) }
    }

    private fun hexStringToByteArray(hex: String): ByteArray {
        val len = hex.length
        val data = ByteArray(len / 2)
        var i = 0
        while (i < len) {
            data[i / 2] = ((Character.digit(hex[i], 16) shl 4)
                    + Character.digit(hex[i + 1], 16)).toByte()
            i += 2
        }
        return data
    }
}
