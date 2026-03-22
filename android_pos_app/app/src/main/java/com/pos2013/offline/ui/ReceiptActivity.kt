package com.pos2013.offline.ui

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import com.pos2013.offline.config.GatewayConfig
import com.pos2013.offline.databinding.ActivityReceiptBinding
import java.io.File
import java.io.FileOutputStream
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*

class ReceiptActivity : AppCompatActivity() {

    private lateinit var binding: ActivityReceiptBinding
    private val currencyFormatter = NumberFormat.getCurrencyInstance(Locale.US)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityReceiptBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Get transaction details from intent
        val amount = intent.getDoubleExtra("AMOUNT", 0.0)
        val txnId = intent.getStringExtra("TXN_ID") ?: "TXN-${System.currentTimeMillis()}"
        val stan = intent.getStringExtra("STAN") ?: "000000"
        val settlementCode = intent.getStringExtra("SETTLEMENT_CODE") ?: "PENDING"
        val status = intent.getStringExtra("STATUS") ?: "APPROVED"
        val isOffline = intent.getBooleanExtra("IS_OFFLINE", false)

        // Fill receipt
        binding.tvMerchantId.text = "MID: ${GatewayConfig.MERCHANT_ID}"
        binding.tvTerminalId.text = GatewayConfig.TERMINAL_ID
        binding.tvTransactionId.text = txnId
        binding.tvStan.text = stan
        binding.tvTotalAmount.text = currencyFormatter.format(amount)
        binding.tvStatus.text = if (isOffline) "STORED OFFLINE" else status
        binding.tvStatus.setTextColor(if (isOffline) Color.parseColor("#FFC107") else Color.parseColor("#4CAF50"))
        binding.tvSettlementCode.text = "Settlement: $settlementCode"
        
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
        binding.tvDateTime.text = sdf.format(Date())

        // Action buttons
        binding.btnShare.setOnClickListener {
            shareReceiptAsImage()
        }

        binding.btnDone.setOnClickListener {
            finish()
        }
    }

    private fun shareReceiptAsImage() {
        val bitmap = createBitmapFromView(binding.receiptContainer)
        val file = File(externalCacheDir, "receipt.png")
        val fOut = FileOutputStream(file)
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, fOut)
        fOut.flush()
        fOut.close()

        val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
        
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(shareIntent, "Share Receipt via"))
    }

    private fun createBitmapFromView(view: View): Bitmap {
        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val bgDrawable = view.background
        if (bgDrawable != null) {
            bgDrawable.draw(canvas)
        } else {
            canvas.drawColor(Color.WHITE)
        }
        view.draw(canvas)
        return bitmap
    }
}