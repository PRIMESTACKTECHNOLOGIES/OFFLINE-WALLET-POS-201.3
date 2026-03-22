package com.pos2013.offline.ui

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.pos2013.offline.config.GatewayConfig

import com.pos2013.offline.data.PaymentRepository
import com.pos2013.offline.databinding.ActivitySetupBinding
import kotlinx.coroutines.launch

class SetupActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivitySetupBinding
    private lateinit var repository: PaymentRepository
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Check if already registered
        if (GatewayConfig.isDeviceRegistered(this)) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        
        binding = ActivitySetupBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        repository = PaymentRepository(this)
        
        setupUI()
        loadDeviceInfo()
    }
    
    private fun setupUI() {
        binding.etServerUrl.setText(GatewayConfig.SERVER_URL)
        
        binding.btnRegister.setOnClickListener {
            registerDevice()
        }
        
        binding.btnTestConnection.setOnClickListener {
            testConnection()
        }
    }
    
    private fun loadDeviceInfo() {
        val deviceInfo = buildString {
            appendLine("📱 Device: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
            appendLine("🤖 Android: ${android.os.Build.VERSION.RELEASE}")
            appendLine("🔢 Serial: ${Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID).takeLast(8)}")
        }
        binding.tvDeviceInfo.text = deviceInfo
    }
    
    private fun testConnection() {
        val serverUrl = binding.etServerUrl.text.toString().trim()
        
        if (serverUrl.isEmpty()) {
            binding.etServerUrl.error = "Enter server URL"
            return
        }
        
        binding.progressBar.visibility = View.VISIBLE
        binding.btnTestConnection.isEnabled = false
        
        lifecycleScope.launch {
            try {
                // Temporarily set URL for testing
                val prefs = getSharedPreferences("pos_prefs", MODE_PRIVATE)
                prefs.edit().putString("server_url", serverUrl).apply()
                GatewayConfig.refreshFromPreferences(this@SetupActivity)
                
                val isReachable = testServerReachable(serverUrl)
                
                if (isReachable) {
                    Toast.makeText(this@SetupActivity, "✅ Server reachable!", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this@SetupActivity, "❌ Cannot reach server", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@SetupActivity, "❌ Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
            
            binding.progressBar.visibility = View.GONE
            binding.btnTestConnection.isEnabled = true
        }
    }
    
    private fun testServerReachable(serverUrl: String): Boolean {
        return try {
            val base = if (serverUrl.endsWith("/")) serverUrl else "$serverUrl/"
            val url = java.net.URL(base + "api/health")
            val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 8000
                requestMethod = "GET"
            }
            conn.connect()
            val ok = conn.responseCode in 200..299
            conn.disconnect()
            ok
        } catch (e: Exception) {
            false
        }
    }
    
    private fun registerDevice() {
        val merchantId = binding.etMerchantId.text.toString().trim()
        val terminalId = binding.etTerminalId.text.toString().trim()
        val serverUrl = binding.etServerUrl.text.toString().trim()
        val secretKey = binding.etSecretKey.text.toString().trim()
        
        // Validation
        when {
            merchantId.isEmpty() -> {
                binding.etMerchantId.error = "Required"
                return
            }
            terminalId.isEmpty() -> {
                binding.etTerminalId.error = "Required"
                return
            }
            serverUrl.isEmpty() -> {
                binding.etServerUrl.error = "Required"
                return
            }
            secretKey.isEmpty() -> {
                binding.etSecretKey.error = "Required"
                return
            }
        }
        
        binding.progressBar.visibility = View.VISIBLE
        binding.btnRegister.isEnabled = false
        
        lifecycleScope.launch {
            try {
                // Save configuration
                val prefs = getSharedPreferences("pos_prefs", MODE_PRIVATE)
                prefs.edit().apply {
                    putString("merchant_id", merchantId)
                    putString("terminal_id", terminalId)
                    putString("server_url", serverUrl)
                    putString("secret_key", secretKey)
                    apply()
                }
                
                // Refresh config
                GatewayConfig.refreshFromPreferences(this@SetupActivity)
                
                // Verify credentials with server
                val isValid = repository.verifyCredentials(merchantId, terminalId, secretKey)
                
                if (isValid) {
                    prefs.edit().putBoolean("device_registered", true).apply()
                    Toast.makeText(
                        this@SetupActivity,
                        "✅ Device registered successfully!",
                        Toast.LENGTH_LONG
                    ).show()
                    
                    startActivity(Intent(this@SetupActivity, LoginActivity::class.java))
                    finish()
                } else {
                    Toast.makeText(
                        this@SetupActivity,
                        "❌ Server verification failed. Check Server URL / Terminal ID / Secret Key.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                Toast.makeText(
                    this@SetupActivity,
                    "Error: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
            }
            
            binding.progressBar.visibility = View.GONE
            binding.btnRegister.isEnabled = true
        }
    }
}
