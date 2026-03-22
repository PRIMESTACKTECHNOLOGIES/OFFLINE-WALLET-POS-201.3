/// App Configuration - Centralized configuration for POS-201.3
class AppConfig {
  // Singleton pattern
  static final AppConfig _instance = AppConfig._internal();
  factory AppConfig() => _instance;
  AppConfig._internal();

  // Default values
  static const String defaultMerchantId = 'MRC-1001';
  static const String defaultTerminalId = 'T2013-001';
  static const String defaultServerUrl = 'https://pos-201-3-offline-6-digit-1.onrender.com/';
  
  // MyFatoorah Configuration
  static const bool defaultMyFatoorahTestMode = true;
  static const String myFatoorahTestUrl = 'https://apitest.myfatoorah.com/';
  static const String myFatoorahLiveUrl = 'https://api.myfatoorah.com/';
  
  // App Settings
  static const String appName = 'POS-201.3';
  static const String appVersion = '2.0.0';
  static const int stanMaxValue = 999999;
  static const String protocolVersion = '201.3';
  
  // Security
  static const String encryptionKeyAlias = 'pos_2013_key';
  static const String hmacKeyAlias = 'pos_hmac_key';
  static const int keySize = 256;
  
  // Sync Settings
  static const int syncIntervalMinutes = 15;
  static const int maxRetries = 3;
  static const int retryDelayMs = 1000;
  
  // Timeout Settings
  static const int connectTimeoutSeconds = 30;
  static const int receiveTimeoutSeconds = 30;
  
  // UI Settings
  static const double maxAmount = 999999.99;
  static const int sessionTimeoutMinutes = 5;
  
  // Currency settings
  static const String defaultCurrency = 'USD';
  static const String defaultCurrencySymbol = '\$';
  static const int currencyDecimals = 2;
}
