package com.pos2013.offline.data.model

data class EmvCardData(
    val pan: String,
    val expiryDate: String, // Format: MMYY or MMYY
    val cardholderName: String? = null,
    val serviceCode: String? = null,
    val applicationLabel: String? = null,
    val emvData: String? = null, // Hex string of combined EMV tags
    val readerSource: String = "EMV_CHIP",
    val cardBrand: String? = null,
    val cvmResult: String? = null,
    val pinVerified: Boolean? = null
)
