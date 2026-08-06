package com.pos2013.offline.ui

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.text.method.DigitsKeyListener
import android.view.Gravity
import android.view.View
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.pos2013.offline.PosApplication
import com.pos2013.offline.card.AcsReaderManager
import com.pos2013.offline.card.AndroidBuiltInNfcReaderManager
import com.pos2013.offline.data.AppDatabase
import com.pos2013.offline.data.TransactionRepository
import com.pos2013.offline.data.api.ApiClient
import com.pos2013.offline.data.model.EmvCardData
import com.pos2013.offline.data.model.WalletTopupEntity
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.UUID

class MainActivity : AppCompatActivity() {

    private lateinit var acsReaderManager: AcsReaderManager
    private lateinit var androidNfcReaderManager: AndroidBuiltInNfcReaderManager

    // UI refs
    private lateinit var tvAmount: TextView
    private lateinit var tvStatus: TextView
    private lateinit var tvResult: TextView
    private lateinit var tvReaderStatus: TextView
    private lateinit var btnCharge: Button
    private lateinit var btnSync: Button
    private lateinit var btnRedeemCode: Button
    private lateinit var btnWalletTopup: Button
    private lateinit var tvPending: TextView

    // Amount state
    private var amountBuffer = StringBuilder("0")

    // Persisted STAN counter (000001–999999)
    private val statePrefs by lazy { getSharedPreferences("pos_state", Context.MODE_PRIVATE) }
    private var lastStan: Int
        get() = statePrefs.getInt("last_stan", 0)
        set(v) = statePrefs.edit().putInt("last_stan", v).apply()


    // ── Lifecycle ─────────────────────────────────────────────────────────────
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Hide Action Bar and style Status Bar
        supportActionBar?.hide()
        window.apply {
            addFlags(android.view.WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
            statusBarColor = Color.parseColor("#1E3A5F")
        }

        // Initialize readers
        acsReaderManager = AcsReaderManager(this)
        androidNfcReaderManager = AndroidBuiltInNfcReaderManager(this)

        buildUI()
        refreshPendingCount()
        setStatus("OFFLINE", "#D97706")
        observeReaders()
    }

    override fun onResume() {
        super.onResume()
        refreshPendingCount()
        acsReaderManager.openReader()
        if (androidNfcReaderManager.isAvailable()) {
            androidNfcReaderManager.enableReaderMode()
        }
    }

    override fun onPause() {
        super.onPause()
        acsReaderManager.closeReader()
        if (androidNfcReaderManager.isAvailable()) {
            androidNfcReaderManager.disableReaderMode()
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.let {
            androidNfcReaderManager.handleIntent(it)
        }
    }

    private fun observeReaders() {
        lifecycleScope.launch {
            acsReaderManager.readerStatus.collectLatest { status ->
                updateReaderStatus(status, "📇")
            }
        }

        lifecycleScope.launch {
            androidNfcReaderManager.readerStatus.collectLatest { status ->
                updateReaderStatus(status, "📱")
            }
        }

        lifecycleScope.launch {
            acsReaderManager.cardData.collectLatest { cardData ->
                cardData?.let {
                    showCardDetectedDialog(it)
                }
            }
        }

        lifecycleScope.launch {
            androidNfcReaderManager.cardData.collectLatest { cardData ->
                cardData?.let {
                    showCardDetectedDialog(it)
                }
            }
        }
    }

    private fun updateReaderStatus(status: String, prefix: String) {
        tvReaderStatus.text = "$prefix $status"
    }

    private fun getRepo(): TransactionRepository {
        val prefs = getSharedPreferences("pos_settings", Context.MODE_PRIVATE)
        val jwtToken = PosApplication.getJwtToken(this)
        val serverUrl = PosApplication.getServerUrl(this)
        val appDatabase = (application as PosApplication).database
        return TransactionRepository(
            dao = appDatabase.transactionDao(),
            walletTopupDao = appDatabase.walletTopupDao(),
            api = ApiClient.createPayment2013Api(serverUrl),
            walletsApi = ApiClient.createWalletsApi(serverUrl, jwtToken),
            merchantId = prefs.getString("merchant_id", "MERCHANT123") ?: "MERCHANT123",
            terminalId = prefs.getString("terminal_id", "TERM001") ?: "TERM001"
        )
    }

    // ── Build UI ───────────────────────────────────────────────────────────────
    private fun buildUI() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#F1F5F9"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
        }

        // Header
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#1E3A5F"))
            setPadding(dp(16), dp(14), dp(16), dp(14))
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        val tvTitle = TextView(this).apply {
            text = "POS Offline"
            textSize = 20f
            setTextColor(Color.WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        tvStatus = TextView(this).apply {
            text = "● Checking..."
            textSize = 12f
            setTextColor(Color.parseColor("#93C5FD"))
            setPadding(0, 0, dp(12), 0)
        }
        val btnSettings = TextView(this).apply {
            text = "⚙"
            textSize = 28f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(dp(20), dp(10), dp(20), dp(10))
            isClickable = true
            isFocusable = true

            val outValue = android.util.TypedValue()
            theme.resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, outValue, true)
            setBackgroundResource(outValue.resourceId)
            
            setOnClickListener { 
                startActivity(Intent(this@MainActivity, SettingsActivity::class.java)) 
            }
        }
        header.addView(tvTitle); header.addView(tvStatus); header.addView(btnSettings)
        root.addView(header)

        // Amount card
        val amountCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            setPadding(dp(24), dp(16), dp(24), dp(16))
            gravity = Gravity.CENTER_HORIZONTAL
        }
        TextView(this).apply {
            text = "Amount (AED)"
            textSize = 12f
            setTextColor(Color.parseColor("#9CA3AF"))
            gravity = Gravity.CENTER
        }.also { amountCard.addView(it) }
        tvAmount = TextView(this).apply {
            text = "0.00"
            textSize = 52f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#111827"))
            gravity = Gravity.END
        }
        amountCard.addView(tvAmount)
        tvPending = TextView(this).apply {
            text = ""
            textSize = 11f
            setTextColor(Color.parseColor("#D97706"))
            gravity = Gravity.CENTER
            setPadding(0, dp(4), 0, 0)
        }
        amountCard.addView(tvPending)
        root.addView(amountCard)

        // Reader status banner
        tvReaderStatus = TextView(this).apply {
            text = "📇 Waiting for reader..."
            textSize = 13f
            setTextColor(Color.parseColor("#374151"))
            setPadding(dp(16), dp(8), dp(16), dp(8))
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#FFFBEB"))
        }
        root.addView(tvReaderStatus)

        // Result banner
        tvResult = TextView(this).apply {
            text = "Ready"
            textSize = 13f
            setTextColor(Color.parseColor("#374151"))
            setPadding(dp(16), dp(10), dp(16), dp(10))
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#EFF6FF"))
        }
        root.addView(tvResult)

        root.addView(buildKeypad())
        root.addView(buildActionRow())
        setContentView(root)
    }

    private fun buildKeypad(): GridLayout {
        val grid = GridLayout(this).apply {
            columnCount = 3
            setPadding(dp(10), dp(10), dp(10), dp(4))
            setBackgroundColor(Color.parseColor("#F1F5F9"))
        }
        listOf("1","2","3","4","5","6","7","8","9","C","0",".").forEach { key ->
            val isC = key == "C"
            val btn = Button(this).apply {
                text = key
                textSize = 24f
                setTextColor(if (isC) Color.parseColor("#DC2626") else Color.parseColor("#1F2937"))
                setBackgroundColor(if (isC) Color.parseColor("#FEE2E2") else Color.WHITE)
                setPadding(0, dp(16), 0, dp(16))
                elevation = 2f
                layoutParams = GridLayout.LayoutParams().apply {
                    width = 0; height = GridLayout.LayoutParams.WRAP_CONTENT
                    columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
                    setMargins(dp(4), dp(4), dp(4), dp(4))
                }
                setOnClickListener { onKeyPress(key) }
            }
            grid.addView(btn)
        }
        return grid
    }

    private fun buildActionRow(): LinearLayout {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            setPadding(dp(12), dp(8), dp(12), dp(12))
        }

        // Top row: Charge + Sync
        val topRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }

        btnCharge = Button(this).apply {
            text = "Charge"
            textSize = 16f; setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#1E3A5F"))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                .apply { marginEnd = dp(6) }
            setPadding(0, dp(16), 0, dp(16))
            setOnClickListener { onChargeClick() }
        }
        btnSync = Button(this).apply {
            text = "Sync ↑"
            textSize = 14f; setTextColor(Color.parseColor("#92400E"))
            setBackgroundColor(Color.parseColor("#FDE68A"))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT)
            setPadding(dp(20), dp(16), dp(20), dp(16))
            visibility = View.GONE
            setOnClickListener { onSyncClick() }
        }
        topRow.addView(btnCharge); topRow.addView(btnSync)
        row.addView(topRow)

        // Wallet Topup button
        row.addView(space(8))
        btnWalletTopup = Button(this).apply {
            text = "💳 Wallet Topup"
            textSize = 15f; setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#7C3AED"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            setPadding(0, dp(14), 0, dp(14))
            setOnClickListener { showWalletTopupDialog() }
        }
        row.addView(btnWalletTopup)

        // Bottom row: Redeem 6-digit code
        row.addView(space(8))
        btnRedeemCode = Button(this).apply {
            text = "⌨  Enter 6-Digit Code"
            textSize = 15f; setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#16A34A"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            setPadding(0, dp(14), 0, dp(14))
            setOnClickListener { showRedeemCodeDialog() }
        }
        row.addView(btnRedeemCode)

        return row
    }

    private fun showCardDetectedDialog(cardData: EmvCardData) {
        val amount = getAmount()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(8))
        }
        TextView(this).apply {
            text = "Card Detected"
            textSize = 18f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#111827"))
            gravity = Gravity.CENTER
        }.also { layout.addView(it) }
        layout.addView(space(12))
        TextView(this).apply {
            text = cardData.pan
            textSize = 20f
            typeface = android.graphics.Typeface.MONOSPACE
            setTextColor(Color.parseColor("#1E3A5F"))
            gravity = Gravity.CENTER
        }.also { layout.addView(it) }
        cardData.cardholderName?.let { name ->
            layout.addView(space(4))
            TextView(this).apply {
                text = name
                textSize = 14f
                setTextColor(Color.parseColor("#6B7280"))
                gravity = Gravity.CENTER
            }.also { layout.addView(it) }
        }
        layout.addView(space(12))

        AlertDialog.Builder(this)
            .setView(layout)
            .setPositiveButton("Charge") { _, _ ->
                if (amount <= 0) {
                    toast("Enter amount first!")
                    return@setPositiveButton
                }
                val expiry = cardData.expiryDate.let {
                    if (it.length == 4) "${it.take(2)}/${it.takeLast(2)}" else it
                }
                processOfflineQueue(amount, cardData.pan, expiry, "EMV_CHIP")
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showWalletTopupDialog() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(8))
        }

        val etCustomerId = EditText(this).apply {
            hint = "Customer ID"
            inputType = InputType.TYPE_CLASS_TEXT; textSize = 16f
        }
        val etTopupAmount = EditText(this).apply {
            hint = "Topup Amount (AED)"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL; textSize = 16f
        }
        val infoBox = TextView(this).apply {
            text = "Tap card on reader to auto-fill details"
            textSize = 11f
            setTextColor(Color.parseColor("#6B7280"))
            setPadding(0, dp(8), 0, 0)
        }

        layout.addView(label("Customer ID")); layout.addView(etCustomerId); layout.addView(space(6))
        layout.addView(label("Topup Amount")); layout.addView(etTopupAmount); layout.addView(infoBox)

        val dialog = AlertDialog.Builder(this)
            .setTitle("💳 Wallet Topup")
            .setView(layout)
            .setPositiveButton("Queue Topup") { _, _ ->
                val customerId = etCustomerId.text.toString().trim()
                val topupAmount = etTopupAmount.text.toString().toDoubleOrNull() ?: 0.0
                if (customerId.isEmpty()) {
                    toast("Enter customer ID")
                    return@setPositiveButton
                }
                if (topupAmount <= 0) {
                    toast("Enter valid amount")
                    return@setPositiveButton
                }
                // Check if we have a recent card
                acsReaderManager.cardData.value?.let { cardData ->
                    queueWalletTopup(customerId, topupAmount, cardData)
                } ?: run {
                    // Fallback: no card, just queue placeholder
                    queueWalletTopup(customerId, topupAmount, null)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()

        // Observe card data while dialog is open
        lifecycleScope.launch {
            acsReaderManager.cardData.collectLatest { cardData ->
                cardData?.let {
                    dialog.setTitle("💳 Card Ready for Topup")
                    dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.text = "Topup with ${it.pan}"
                }
            }
        }
    }

    private fun queueWalletTopup(customerId: String, amount: Double, cardData: EmvCardData?) {
        setResult("⏳ Queueing wallet topup...")
        lifecycleScope.launch {
            try {
                val amountMinor = (amount * 100).toLong()
                val topup = WalletTopupEntity(
                    id = UUID.randomUUID().toString(),
                    customerId = customerId,
                    amountMinor = amountMinor,
                    currency = "AED",
                    panMasked = cardData?.pan ?: "MANUAL_ENTRY",
                    expiry = cardData?.expiryDate ?: "",
                    txnTimestamp = System.currentTimeMillis(),
                    entryMode = if (cardData != null) "EMV_CHIP" else "MANUAL",
                    emvData = cardData?.emvData
                )
                getRepo().createOfflineWalletTopup(topup)
                setResult("💾 Wallet topup queued: AED ${"%.2f".format(amount)} for $customerId", "#FEF3C7")
                toast("Queued wallet topup")
                refreshPendingCount()
            } catch (e: Exception) {
                setResult("❌ Error: ${e.message}", "#FEE2E2")
            }
        }
    }

    // ── Keypad logic ──────────────────────────────────────────────────────────
    private fun onKeyPress(key: String) {
        when (key) {
            "C" -> amountBuffer = StringBuilder("0")
            "." -> if (!amountBuffer.contains('.')) amountBuffer.append('.')
            else -> {
                if (amountBuffer.toString() == "0") amountBuffer = StringBuilder(key)
                else {
                    val dot = amountBuffer.indexOf('.')
                    if (dot >= 0 && amountBuffer.length - dot > 2) return
                    amountBuffer.append(key)
                }
            }
        }
        tvAmount.text = amountBuffer.toString()
    }

    private fun getAmount(): Double = amountBuffer.toString().toDoubleOrNull() ?: 0.0

    // ── Processor health check ────────────────────────────────────────────────
    private fun setStatus(text: String, hex: String) {
        tvStatus.text = "● $text"
        tvStatus.setTextColor(Color.parseColor(hex))
    }

    // ── Charge click — card PAN dialog → offline queue ────────────────────────
    private fun onChargeClick() {
        val amount = getAmount()
        if (amount <= 0) { toast("Enter a valid amount"); return }
        showCardDialog(amount)
    }

    private fun showCardDialog(amount: Double) {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(8))
        }

        val etPan = EditText(this).apply {
            hint = "Card Number (13-19 digits)"
            inputType = InputType.TYPE_CLASS_NUMBER
            keyListener = DigitsKeyListener.getInstance("0123456789")
            filters = arrayOf(InputFilter.LengthFilter(19))
            textSize = 16f
        }
        val etExpiry = EditText(this).apply {
            hint = "Expiry MM/YY"
            inputType = InputType.TYPE_CLASS_NUMBER
            keyListener = DigitsKeyListener.getInstance("0123456789")
            filters = arrayOf(InputFilter.LengthFilter(4))
            textSize = 16f
        }
        val etCvv = EditText(this).apply {
            hint = "CVV"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            keyListener = DigitsKeyListener.getInstance("0123456789")
            filters = arrayOf(InputFilter.LengthFilter(4))
            textSize = 16f
        }

        layout.addView(label("Card Number")); layout.addView(etPan); layout.addView(space(6))
        layout.addView(label("Expiry (MM/YY)")); layout.addView(etExpiry); layout.addView(space(6))
        layout.addView(label("CVV")); layout.addView(etCvv)

        AlertDialog.Builder(this)
            .setTitle("Pay AED ${"%.2f".format(amount)}")
            .setView(layout)
            .setPositiveButton("Queue & Process") { _, _ ->
                val pan = etPan.text.toString().trim().replace(" ", "")
                val expiry = etExpiry.text.toString().trim()
                if (!pan.matches(Regex("^\\d+$"))) { toast("Enter numbers only"); return@setPositiveButton }
                if (pan.length < 13) { toast("Invalid card number"); return@setPositiveButton }
                val last4 = pan.takeLast(4)
                val panMasked = "*".repeat(pan.length - 4) + last4
                processOfflineQueue(amount, panMasked, expiry)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // ── Store offline transaction in Room ─────────────────────────────────────
    private fun processOfflineQueue(amount: Double, panMasked: String, expiry: String, entryMode: String = "MANUAL") {
        val nextStan = generateNextStan()
        val amountMinor = (amount * 100).toLong()

        setResult("⏳ Saving transaction...")
        lifecycleScope.launch {
            try {
                getRepo().createOfflineTransaction(
                    amountMinor = amountMinor,
                    currency = "AED",
                    panMasked = panMasked,
                    expiry = expiry,
                    stan = nextStan,
                    entryMode = entryMode,
                    txnType = "SALE",
                    authMode = "OFFLINE_APPROVED"
                )
                setResult("💾 Queued  STAN: $nextStan  AED ${"%.2f".format(amount)}", "#FEF3C7")
                resetAmount()
                refreshPendingCount()
                toast("Saved — press Sync ↑ to upload")

                // Auto-sync if online
                if (isNetworkAvailable()) onSyncClick()
            } catch (e: Exception) {
                setResult("❌ Save failed: ${e.message}", "#FEE2E2")
            }
        }
    }

    // ── Sync → upload batch → receive 6-digit settlement code ─────────────────
    private fun onSyncClick() {
        if (!isNetworkAvailable()) { toast("No internet"); return }
        setResult("🔄 Uploading batch and wallet topups...")
        btnSync.isEnabled = false

        lifecycleScope.launch {
            try {
                val result = getRepo().syncPendingTransactions()
                if (result.success) {
                    refreshPendingCount()
                    val message = buildString {
                        append("✅ Sync complete")
                        if (result.count > 0) append(" (${result.count} tx)")
                        if (result.walletTopupsSynced > 0) append(" (${result.walletTopupsSynced} wallet topups)")
                    }
                    setResult(message, "#D1FAE5")
                } else {
                    setResult("⚠ Sync error: ${result.errorMessage}", "#FEE2E2")
                }
            } catch (e: Exception) {
                setResult("❌ Sync failed: ${e.message}", "#FEE2E2")
            } finally {
                btnSync.isEnabled = true
            }
        }
    }

    // ── Redeem 6-digit code dialog ────────────────────────────────────────────
    private fun showRedeemCodeDialog() {
        val amount = getAmount()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(8))
        }

        val infoBox = TextView(this).apply {
            text = "Customer enters their 6-digit payment code below.\nAmount must match the code's value."
            textSize = 12f
            setTextColor(Color.parseColor("#374151"))
            setBackgroundColor(Color.parseColor("#F0FDF4"))
            setPadding(dp(10), dp(8), dp(10), dp(8))
        }
        layout.addView(infoBox)
        layout.addView(space(10))

        if (amount > 0) {
            layout.addView(label("Amount to charge: AED ${"%.2f".format(amount)}"))
            layout.addView(space(6))
        }

        val etCode = EditText(this).apply {
            hint = "6-digit code"
            inputType = InputType.TYPE_CLASS_NUMBER
            textSize = 28f
            typeface = android.graphics.Typeface.MONOSPACE
            setTextColor(Color.parseColor("#1E3A5F"))
            gravity = Gravity.CENTER
            filters = arrayOf(android.text.InputFilter.LengthFilter(6))
        }
        layout.addView(label("Payment Code")); layout.addView(etCode)

        // If no amount entered, show amount field too
        var etAmount: EditText? = null
        if (amount <= 0) {
            layout.addView(space(6))
            layout.addView(label("Amount (AED)"))
            etAmount = EditText(this).apply {
                hint = "0.00"
                inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
                textSize = 18f
            }
            layout.addView(etAmount)
        }

        AlertDialog.Builder(this)
            .setTitle("⌨  Redeem Payment Code")
            .setView(layout)
            .setPositiveButton("Redeem") { _, _ ->
                val code = etCode.text.toString().trim()
                if (code.length != 6) { toast("Code must be exactly 6 digits"); return@setPositiveButton }
                val chargeAmount = if (amount > 0) amount
                    else etAmount?.text?.toString()?.toDoubleOrNull() ?: 0.0
                if (chargeAmount <= 0) { toast("Enter a valid amount"); return@setPositiveButton }
                processRedemption(code, chargeAmount)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun processRedemption(code: String, amount: Double) {
        setResult("⏳ Redeeming code $code...")
        btnRedeemCode.isEnabled = false

        lifecycleScope.launch {
            try {
                val (success, message, reference) = getRepo().redeemCode(code, amount)
                if (success) {
                    setResult("✅ Code $code APPROVED\nAED ${"%.2f".format(amount)}\nRef: $reference", "#D1FAE5")
                    resetAmount()
                    toast("Payment approved!")
                } else {
                    setResult("❌ Code $code REJECTED\n$message", "#FEE2E2")
                    toast("Redemption failed")
                }
            } catch (e: Exception) {
                setResult("❌ Error: ${e.message}", "#FEE2E2")
            } finally {
                btnRedeemCode.isEnabled = true
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private fun refreshPendingCount() {
        lifecycleScope.launch {
            try {
                val db = (application as PosApplication).database
                val pendingTx = db.transactionDao().countByStatus("PENDING")
                val pendingWalletTopups = db.walletTopupDao().countPendingTopups()
                val totalPending = pendingTx + pendingWalletTopups

                if (totalPending > 0) {
                    val message = buildString {
                        append("⚠ ")
                        if (pendingTx > 0) append("$pendingTx tx")
                        if (pendingTx > 0 && pendingWalletTopups > 0) append(" + ")
                        if (pendingWalletTopups > 0) append("$pendingWalletTopups wallet topup${if (pendingWalletTopups > 1) "s" else ""}")
                        append(" pending — tap Sync ↑")
                    }
                    tvPending.text = message
                    btnSync.visibility = View.VISIBLE
                } else {
                    tvPending.text = ""
                    btnSync.visibility = View.GONE
                }
            } catch (_: Exception) {}
        }
    }

    private fun generateNextStan(): String {
        val next = if (lastStan >= 999_999) 1 else lastStan + 1
        lastStan = next
        return String.format("%06d", next)
    }

    private fun setResult(msg: String, bgHex: String = "#EFF6FF") {
        tvResult.text = msg
        tvResult.setBackgroundColor(Color.parseColor(bgHex))
    }

    private fun resetAmount() {
        amountBuffer = StringBuilder("0")
        tvAmount.text = "0.00"
    }

    private fun isNetworkAvailable(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork ?: return false) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun toast(msg: String) =
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun label(text: String) = TextView(this).apply {
        this.text = text; textSize = 11f
        setTextColor(Color.parseColor("#6B7280"))
        setPadding(0, dp(4), 0, dp(2))
    }

    private fun space(dpVal: Int) = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dp(dpVal))
    }
}
