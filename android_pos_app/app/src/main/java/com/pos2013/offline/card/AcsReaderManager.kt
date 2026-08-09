
package com.pos2013.offline.card

import android.content.Context
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.util.Log
import com.acs.smartcard.Reader
import com.pos2013.offline.data.model.EmvCardData
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.math.BigInteger
import java.util.Locale

class AcsReaderManager(private val context: Context) {
    companion object {
        private const val TAG = "AcsReaderManager"
        private const val SLOT_0 = 0
        private val SELECT_PPSE = byteArrayOf(0x00.toByte(), 0xA4.toByte(), 0x04.toByte(), 0x00.toByte(), 0x0E.toByte(), 0x32.toByte(), 0x50.toByte(), 0x41.toByte(), 0x59.toByte(), 0x2E.toByte(), 0x53.toByte(), 0x59.toByte(), 0x53.toByte(), 0x2E.toByte(), 0x44.toByte(), 0x44.toByte(), 0x46.toByte(), 0x30.toByte(), 0x31.toByte(), 0x00.toByte())
        private val SELECT_VISA = byteArrayOf(0x00.toByte(), 0xA4.toByte(), 0x04.toByte(), 0x00.toByte(), 0x07.toByte(), 0xA0.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x03.toByte(), 0x10.toByte(), 0x10.toByte(), 0x00.toByte())
        private val SELECT_MC = byteArrayOf(0x00.toByte(), 0xA4.toByte(), 0x04.toByte(), 0x00.toByte(), 0x07.toByte(), 0xA0.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x04.toByte(), 0x10.toByte(), 0x10.toByte(), 0x00.toByte())
        private val GET_PROCESSING_OPTIONS = byteArrayOf(0x80.toByte(), 0xA8.toByte(), 0x00.toByte(), 0x00.toByte(), 0x02.toByte(), 0x83.toByte(), 0x00.toByte(), 0x00.toByte())
        private val READ_RECORD = byteArrayOf(0x00.toByte(), 0xB2.toByte(), 0x01.toByte(), 0x0C.toByte(), 0x00.toByte())
    }

    private var reader: Reader? = null
    private val _cardData = MutableStateFlow<EmvCardData?>(null)
    val cardData: StateFlow<EmvCardData?> = _cardData

    private val _readerStatus = MutableStateFlow<String>("Waiting for reader...")
    val readerStatus: StateFlow<String> = _readerStatus

    fun openReader() {
        try {
            val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager
            if (usbManager == null) {
                _readerStatus.value = "USB manager unavailable"
                return
            }

            reader = Reader(usbManager)
            reader?.setOnStateChangeListener(object : Reader.OnStateChangeListener {
                override fun onStateChange(slot: Int, state: Int, error: Int) {
                    Log.d(TAG, "Reader state changed: slot=$slot state=$state error=$error")
                    when (state) {
                        Reader.CARD_PRESENT -> {
                            _readerStatus.value = "Card present"
                            readCard()
                        }
                        Reader.CARD_ABSENT -> _readerStatus.value = "Reader ready"
                        else -> {}
                    }
                }
            })

            val supportedDevice = usbManager.deviceList.values.firstOrNull { device ->
                reader?.isSupported(device) == true
            }

            if (supportedDevice != null) {
                reader?.open(supportedDevice)
                _readerStatus.value = "Reader ready"
            } else {
                _readerStatus.value = "No supported USB reader found"
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing reader", e)
            _readerStatus.value = "Init error: ${e.message}"
        }
    }

    private fun readCard() {
        try {
            val currentReader = reader ?: return
            val atr = currentReader.power(SLOT_0, Reader.CARD_COLD_RESET)
            if (atr.isEmpty()) {
                _readerStatus.value = "No card response"
                return
            }

            val emvDataHex = atr.joinToString("") { "%02X".format(it) }
            _cardData.value = EmvCardData(
                pan = "",
                expiryDate = "",
                emvData = emvDataHex,
                readerSource = "EMV_CHIP"
            )
            _readerStatus.value = "Card detected"

            // Reset after 5s so it doesn't re-fire on next collect
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                _cardData.value = null
                _readerStatus.value = "Reader ready"
            }, 5000)
        } catch (e: Exception) {
            Log.e(TAG, "Error reading card", e)
            _readerStatus.value = "Read error: ${e.message}"
        }
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
                val valueStr = try {
                    String(valueBytes, Charsets.ISO_8859_1)
                } catch (e: Exception) {
                    ""
                }
                tags[tag] = valueHex
                index += length
            } else {
                break
            }
        }
    }

    private fun parseTrack2EquivData(hex: String): Pair<String, String>? {
        try {
            val track2Data = BigInteger(hex, 16).toString(2).padStart(hex.length * 4, '0')
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

    fun closeReader() {
        try {
            reader?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing reader", e)
        }
    }
}
