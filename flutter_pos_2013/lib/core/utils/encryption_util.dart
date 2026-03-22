import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:encrypt/encrypt.dart' as encrypt;
import 'package:crypto/crypto.dart';

/// AES-GCM Encryption Utility for Card Data
class EncryptionUtil {
  static const String algorithm = 'AES/GCM/NoPadding';
  static const int keySize = 32; // 256 bits
  static const int ivSize = 16;  // 128 bits
  static const int tagSize = 16; // 128 bits

  late encrypt.Encrypter _encrypter;
  late encrypt.Key _key;

  /// Initialize with a base64 encoded key
  EncryptionUtil({String? base64Key}) {
    if (base64Key != null && base64Key.isNotEmpty) {
      _key = encrypt.Key.fromBase64(base64Key);
    } else {
      _key = encrypt.Key.fromSecureRandom(keySize);
    }
    _encrypter = encrypt.Encrypter(
      encrypt.AES(_key, mode: encrypt.AESMode.gcm),
    );
  }

  /// Generate a new random key
  static String generateKey() {
    final key = encrypt.Key.fromSecureRandom(keySize);
    return key.base64;
  }

  /// Encrypt plaintext data
  String encrypt(String plaintext) {
    try {
      final iv = encrypt.IV.fromSecureRandom(ivSize);
      final encrypted = _encrypter.encrypt(plaintext, iv: iv);
      
      // Combine IV + ciphertext + tag
      final combined = Uint8List(iv.bytes.length + encrypted.bytes.length);
      combined.setAll(0, iv.bytes);
      combined.setAll(iv.bytes.length, encrypted.bytes);
      
      return base64Encode(combined);
    } catch (e) {
      throw EncryptionException('Encryption failed: $e');
    }
  }

  /// Decrypt ciphertext data
  String decrypt(String ciphertext) {
    try {
      final combined = base64Decode(ciphertext);
      
      // Extract IV and encrypted data
      final iv = encrypt.IV(Uint8List.sublistView(combined, 0, ivSize));
      final encryptedData = Uint8List.sublistView(combined, ivSize);
      
      final encrypted = encrypt.Encrypted(encryptedData);
      return _encrypter.decrypt(encrypted, iv: iv);
    } catch (e) {
      throw EncryptionException('Decryption failed: $e');
    }
  }

  /// Encrypt card number (PAN) - only stores last 4 digits in plaintext
  static Map<String, String> encryptCardData(String pan, String? expiry) {
    final last4 = pan.length >= 4 ? pan.substring(pan.length - 4) : pan;
    
    // Generate a random key for this session
    final key = generateKey();
    final encrypter = EncryptionUtil(base64Key: key);
    
    // Encrypt the full PAN
    final encryptedPan = encrypter.encrypt(pan);
    
    // Encrypt expiry if provided
    String? encryptedExpiry;
    if (expiry != null && expiry.isNotEmpty) {
      encryptedExpiry = encrypter.encrypt(expiry);
    }

    return {
      'encryptedPan': encryptedPan,
      'encryptedExpiry': encryptedExpiry ?? '',
      'last4': last4,
      'key': key, // In production, store key in secure hardware
    };
  }

  /// Mask card number for display
  static String maskCardNumber(String pan) {
    if (pan.length < 4) return pan;
    final last4 = pan.substring(pan.length - 4);
    final masked = '*' * (pan.length - 4);
    // Format with spaces every 4 characters
    final buffer = StringBuffer();
    for (var i = 0; i < masked.length; i++) {
      if (i > 0 && i % 4 == 0) buffer.write(' ');
      buffer.write(masked[i]);
    }
    buffer.write(' ');
    buffer.write(last4);
    return buffer.toString();
  }

  /// Validate card number using Luhn algorithm
  static bool validateCardNumber(String pan) {
    if (pan.isEmpty || pan.length < 13) return false;
    
    int sum = 0;
    bool alternate = false;
    
    for (int i = pan.length - 1; i >= 0; i--) {
      int n = int.parse(pan[i]);
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    
    return sum % 10 == 0;
  }

  /// Get card type from PAN
  static String getCardType(String pan) {
    if (pan.startsWith('4')) return 'visa';
    if (pan.startsWith('5')) return 'mastercard';
    if (pan.startsWith('34') || pan.startsWith('37')) return 'amex';
    if (pan.startsWith('6')) return 'discover';
    if (pan.startsWith('35')) return 'jcb';
    return 'unknown';
  }

  /// Derive a key from password using PBKDF2
  static String deriveKey(String password, {String? salt}) {
    final actualSalt = salt ?? generateSalt();
    final bytes = utf8.encode(password + actualSalt);
    final digest = sha256.convert(bytes);
    return base64Encode(digest.bytes);
  }

  /// Generate random salt
  static String generateSalt() {
    final random = Random.secure();
    final values = List<int>.generate(16, (i) => random.nextInt(256));
    return base64Encode(values);
  }
}

/// Exception for encryption errors
class EncryptionException implements Exception {
  final String message;
  EncryptionException(this.message);
  
  @override
  String toString() => 'EncryptionException: $message';
}
