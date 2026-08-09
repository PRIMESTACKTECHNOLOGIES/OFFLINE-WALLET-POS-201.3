package com.pos2013.offline.card

import android.app.Activity
import android.content.Intent
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.util.Log
import com.pos2013.offline.data.model.EmvCardData
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.math.BigInteger

class AndroidBuiltInNfcReaderManager(private val activity: Activity) {
    companion object {
        private const val TAG = "AndroidNfcReader"
        private val SELECT_PPSE = byteArrayOf(0x00.toByte(), 0xA4.toByte(), 0x04.toByte(), 0x00.toByte(), 0x0E.toByte(), 0x32.toByte(), 0x50.toByte(), 0x41.toByte(), 0x59.toByte(), 0x2E.toByte(), 0x53.toByte(), 0x59.toByte(), 0x53.toByte(), 0x2E.toByte(), 0x44.toByte(), 0x44.toByte(), 0x46.toByte(), 0x30.toByte(), 0x31.toByte(), 0x00.toByte())
        private val SELECT_VISA = byteArrayOf(0x00.toByte(), 0xA4.toByte(), 0x04.toByte(), 0x00.toByte(), 0x07.toByte(), 0xA0.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x03.toByte(), 0x10.toByte(), 0x10.toByte(), 0x00.toByte())
        private val SELECT_MC = byteArrayOf(0x00.toByte(), 0xA4.toByte(), 0x04.toByte(), 0x00.toByte(), 0x07.toByte(), 0xA0.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x04.toByte(), 0x10.toByte(), 0x10.toByte(), 0x00.toByte())
        private val SELECT_VIRTUAL_WALLET = byteArrayOf(0x00.toByte(), 0xA4.toByte(), 0x04.toByte(), 0x00.toByte(), 0x07.toByte(), 0xF0.toByte(), 0x39.toByte(), 0x41.toByte(), 0x48.toByte(), 0x34.toByte(), 0x10.toByte(), 0x10.toByte(), 0x00.toByte())
        private val GET_PROCESSING_OPTIONS = byteArrayOf(0x80.toByte(), 0xA8.toByte(), 0x00.toByte(), 0x00.toByte(), 0x02.toByte(), 0x83.toByte(), 0x00.toByte(), 0x00.toByte())
    }

    private val nfcAdapter: NfcAdapter? = NfcAdapter.getDefaultAdapter(activity)
    private val _cardData = MutableStateFlow<EmvCardData?>(null)
    val cardData: StateFlow<EmvCardData?> = _cardData

    private val _readerStatus = MutableStateFlow<String>("Waiting for NFC tag...")
    val readerStatus: StateFlow<String> = _readerStatus

    fun isAvailable(): Boolean = nfcAdapter != null && nfcAdapter.isEnabled

    fun enableReaderMode() {
        try {
            _readerStatus.value = "Enabling NFC reader..."
            Log.d(TAG, "Enabling reader mode with all tech flags")
            nfcAdapter?.enableReaderMode(
                activity,
                { tag -> 
                    Log.d(TAG, "Tag discovered! ID: ${tag.id.joinToString("") { "%02x".format(it) }}")
                    Log.d(TAG, "Tag tech list: ${tag.techList.joinToString(", ")}")
                    handleTagDiscovered(tag) 
                },
                NfcAdapter.FLAG_READER_NFC_A or 
                NfcAdapter.FLAG_READER_NFC_B or 
                NfcAdapter.FLAG_READER_NFC_F or 
                NfcAdapter.FLAG_READER_NFC_V or 
                NfcAdapter.FLAG_READER_NFC_BARCODE or 
                NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or 
                NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
                null
            )
            _readerStatus.value = "📱 NFC reader active - tap a card!"
        } catch (e: Exception) {
            Log.e(TAG, "Error enabling reader mode", e)
            _readerStatus.value = "❌ Error: ${e.message}"
        }
    }

    fun disableReaderMode() {
        try {
            nfcAdapter?.disableReaderMode(activity)
            _readerStatus.value = "NFC reader disabled"
        } catch (e: Exception) {
            Log.e(TAG, "Error disabling reader mode", e)
        }
    }

    fun handleIntent(intent: Intent) {
        Log.d(TAG, "handleIntent called with action: ${intent.action}")
        val tag = intent.getParcelableExtra<Tag>(NfcAdapter.EXTRA_TAG)
        tag?.let { 
            Log.d(TAG, "Tag from intent")
            handleTagDiscovered(it) 
        }
    }

    private fun handleTagDiscovered(tag: Tag) {
        _readerStatus.value = "🔍 Tag detected! Reading..."
        Log.d(TAG, "Starting tag handling")
        
        try {
            val isoDep = IsoDep.get(tag)
            if (isoDep == null) {
                Log.d(TAG, "Unsupported NFC tag type")
                _cardData.value = null
                _readerStatus.value = "❌ Unsupported NFC tag"
                return
            }
            
            Log.d(TAG, "Connecting to IsoDep tag")
            isoDep.connect()
            isoDep.timeout = 10000 // 10 second timeout for slow cards
            Log.d(TAG, "Connected to tag, starting EMV commands")

            // Try selecting application
            var selectResp = sendApdu(isoDep, SELECT_PPSE)
            if (!isSuccess(selectResp)) {
                Log.d(TAG, "PPSE failed, trying VISA")
                selectResp = sendApdu(isoDep, SELECT_VISA)
            }
            if (!isSuccess(selectResp)) {
                Log.d(TAG, "VISA failed, trying Mastercard")
                selectResp = sendApdu(isoDep, SELECT_MC)
            }
            if (!isSuccess(selectResp)) {
                Log.d(TAG, "MC failed, trying virtual wallet")
                selectResp = sendApdu(isoDep, SELECT_VIRTUAL_WALLET)
            }

            if (!isSuccess(selectResp)) {
                Log.d(TAG, "All app select failed — unable to read card")
                _cardData.value = null
                _readerStatus.value = "❌ NFC card read failed"
                isoDep.close()
                return
            }
            Log.d(TAG, "Application selected successfully")

            // Get processing options
            val gpoResp = sendApdu(isoDep, GET_PROCESSING_OPTIONS)
            Log.d(TAG, "GPO response status: ${if (isSuccess(gpoResp)) "success" else "failed"}")

            // Read records (try even if GPO failed)
            val records = mutableListOf<ByteArray>()
            for (i in 1..16) {
                val readCmd = byteArrayOf(0x00.toByte(), 0xB2.toByte(), i.toByte(), 0x0C.toByte(), 0x00.toByte())
                val readResp = sendApdu(isoDep, readCmd)
                if (isSuccess(readResp) && readResp.size > 2) {
                    records.add(readResp.copyOf(readResp.size - 2))
                }
            }
            Log.d(TAG, "Read ${records.size} records from card")

            // Parse EMV tags
            val emvTags = mutableMapOf<String, String>()
            records.forEach { record ->
                parseBerTlv(record, emvTags)
            }
            Log.d(TAG, "Parsed EMV tags: $emvTags")

            val pan = emvTags["5A"] ?: emvTags["57"]?.let { parseTrack2EquivData(it)?.first }
            val expiry = emvTags["57"]?.let { parseTrack2EquivData(it)?.second } ?: emvTags["5F24"]
            if (pan.isNullOrBlank() || expiry.isNullOrBlank()) {
                Log.d(TAG, "Missing required card data after EMV parse")
                _cardData.value = null
                _readerStatus.value = "❌ NFC card read incomplete"
                isoDep.close()
                return
            }

            val cardholderName = emvTags["5F20"] ?: "CARD HOLDER"
            val serviceCode = emvTags["5F30"] ?: "101"
            val appLabel = emvTags["50"] ?: emvTags["4F"] ?: "VISA"

            val maskedPan = maskPan(pan)
            val emvDataHex = emvTags.map { "${it.key}=${it.value}" }.joinToString("|")
            _cardData.value = EmvCardData(
                pan = maskedPan,
                expiryDate = expiry,
                cardholderName = cardholderName,
                serviceCode = serviceCode,
                applicationLabel = appLabel,
                emvData = emvDataHex
            )
            _readerStatus.value = "✅ Card read successfully!"
            Log.d(TAG, "Card data emitted: $maskedPan")

            isoDep.close()

            // Reset card data after 5s so it doesn't re-fire on next collect
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                _cardData.value = null
                _readerStatus.value = "📱 NFC reader active - tap a card!"
            }, 5000)
        } catch (e: Exception) {
            Log.e(TAG, "Error reading tag", e)
            _cardData.value = null
            _readerStatus.value = "❌ NFC read error: ${e.message}"
        }
    }

    private fun sendApdu(isoDep: IsoDep, apdu: ByteArray): ByteArray {
        return isoDep.transceive(apdu)
    }

    private fun isSuccess(resp: ByteArray): Boolean {
        if (resp.size < 2) return false
        val sw1 = resp[resp.size - 2].toInt() and 0xFF
        val sw2 = resp[resp.size - 1].toInt() and 0xFF
        return sw1 == 0x90 && sw2 == 0x00 || sw1 == 0x61
    }

    private fun parseBerTlv(data: ByteArray, tags: MutableMap<String, String>) {
        var index = 0
        while (index < data.size - 2) {
            var tagLen = 1
            var tag = String.format("%02X", data[index].toInt() and 0xFF)
            if ((data[index].toInt() and 0x1F) == 0x1F) {
                tagLen = 2
                tag += String.format("%02X", data[index + 1].toInt() and 0xFF)
                if ((data[index + 1].toInt() and 0x80) != 0) {
                    tagLen = 3
                    tag += String.format("%02X", data[index + 2].toInt() and 0xFF)
                }
            }
            index += tagLen

            var length = data[index].toInt() and 0xFF
            index += 1
            if (length == 0x81) {
                length = data[index].toInt() and 0xFF
                index += 1
            } else if (length == 0x82) {
                length = ((data[index].toInt() and 0xFF) shl 8) or (data[index + 1].toInt() and 0xFF)
                index += 2
            }

            if (index + length <= data.size) {
                val valueBytes = data.copyOfRange(index, index + length)
                val valueHex = valueBytes.joinToString("") { "%02X".format(it) }
                tags[tag] = valueHex
                index += length
            } else {
                break
            }
        }
    }

    private fun parseTrack2EquivData(hex: String): Pair<String, String>? {
        try {
            val data = hex.replace("D", "=")
            val panEnd = data.indexOfFirst { it == '=' || it == 'D' }
            if (panEnd == -1) return null

            val pan = data.substring(0, panEnd)
            val expiry = if (data.length > panEnd + 5) {
                data.substring(panEnd + 1, panEnd + 5)
            } else {
                ""
            }
            return Pair(pan, expiry)
        } catch (e: Exception) {
            return null
        }
    }

    private fun maskPan(pan: String): String {
        return if (pan.length >= 10) {
            pan.take(6) + "*".repeat(pan.length - 10) + pan.takeLast(4)
        } else {
            pan
        }
    }
}