import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Gateway Configuration Manager
/// Handles all gateway-related settings with secure storage
class GatewayConfig {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
      keyCipherAlgorithm: KeyCipherAlgorithm.RSA_ECB_PKCS1Padding,
      storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
    ),
    iOptions: IOSOptions(
      accountName: 'flutter_pos_2013',
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  // Keys
  static const String _keyMerchantId = 'merchant_id';
  static const String _keyTerminalId = 'terminal_id';
  static const String _keyServerUrl = 'server_url';
  static const String _keySecretKey = 'secret_key';
  static const String _keyMyFatoorahToken = 'myfatoorah_token';
  static const String _keyMyFatoorahTestMode = 'myfatoorah_test_mode';
  static const String _keyDeviceRegistered = 'device_registered';

  // Getters
  static Future<String> get merchantId async =>
      await _storage.read(key: _keyMerchantId) ?? 'MRC-1001';
  
  static Future<String> get terminalId async =>
      await _storage.read(key: _keyTerminalId) ?? 'T2013-001';
  
  static Future<String> get serverUrl async =>
      await _storage.read(key: _keyServerUrl) ?? 
      'https://pos-201-3-offline-6-digit-1.onrender.com/';
  
  static Future<String> get secretKey async =>
      await _storage.read(key: _keySecretKey) ?? '';
  
  static Future<String> get myFatoorahToken async =>
      await _storage.read(key: _keyMyFatoorahToken) ?? '';
  
  static Future<bool> get myFatoorahTestMode async =>
      (await _storage.read(key: _keyMyFatoorahTestMode)) == 'true';

  static Future<bool> get isDeviceRegistered async =>
      (await _storage.read(key: _keyDeviceRegistered)) == 'true';

  // Setters
  static Future<void> setMerchantId(String value) async =>
      await _storage.write(key: _keyMerchantId, value: value);
  
  static Future<void> setTerminalId(String value) async =>
      await _storage.write(key: _keyTerminalId, value: value);
  
  static Future<void> setServerUrl(String value) async =>
      await _storage.write(key: _keyServerUrl, value: value);
  
  static Future<void> setSecretKey(String value) async =>
      await _storage.write(key: _keySecretKey, value: value);
  
  static Future<void> setMyFatoorahToken(String value) async =>
      await _storage.write(key: _keyMyFatoorahToken, value: value);
  
  static Future<void> setMyFatoorahTestMode(bool value) async =>
      await _storage.write(key: _keyMyFatoorahTestMode, value: value.toString());

  static Future<void> setDeviceRegistered(bool value) async =>
      await _storage.write(key: _keyDeviceRegistered, value: value.toString());

  // Helpers
  static Future<bool> get isMyFatoorahConfigured async {
    final token = await myFatoorahToken;
    return token.isNotEmpty;
  }

  static Future<String> get myFatoorahBaseUrl async {
    final isTest = await myFatoorahTestMode;
    return isTest 
        ? 'https://apitest.myfatoorah.com/'
        : 'https://api.myfatoorah.com/';
  }

  static Future<String> get myFatoorahAuthHeader async {
    final token = await myFatoorahToken;
    return 'Bearer $token';
  }

  static Future<void> clearAll() async => await _storage.deleteAll();

  static Future<void> registerDevice({
    required String merchantId,
    required String terminalId,
    required String secretKey,
    required String serverUrl,
  }) async {
    await setMerchantId(merchantId);
    await setTerminalId(terminalId);
    await setSecretKey(secretKey);
    await setServerUrl(serverUrl);
    await setDeviceRegistered(true);
  }

  static Future<void> unregisterDevice() async {
    await _storage.delete(key: _keyDeviceRegistered);
  }
}
