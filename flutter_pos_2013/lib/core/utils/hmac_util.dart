import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:uuid/uuid.dart';

/// HMAC-SHA256 Signature Generator for Protocol 201.3
class HmacUtil {
  static const String algorithm = 'HmacSHA256';
  static const String _keyAlias = 'POS_HMAC_KEY';
  
  /// Generate HMAC-SHA256 signature for batch upload
  static String generateSignature({
    required String protocolVersion,
    required String merchantId,
    required String terminalId,
    required String batchId,
    required int timestamp,
    required String nonce,
    int transactionCount = 1,
    required String secretKey,
  }) {
    final payload = '$protocolVersion|$merchantId|$terminalId|$batchId|$timestamp|$nonce|$transactionCount';
    return generateHmac(payload, secretKey);
  }

  /// Generate HMAC-SHA256 for a string payload
  static String generateHmac(String payload, String secretKey) {
    final key = utf8.encode(secretKey);
    final bytes = utf8.encode(payload);
    
    final hmacSha256 = Hmac(sha256);
    final digest = hmacSha256.convert(bytes);
    
    return base64Encode(digest.bytes);
  }

  /// Generate a random nonce
  static String generateNonce() {
    return const Uuid().v4().replaceAll('-', '').substring(0, 16);
  }

  /// Generate a batch ID
  static String generateBatchId() {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final random = Random().nextInt(9999).toString().padLeft(4, '0');
    return 'BATCH-$timestamp-$random';
  }

  /// Verify a signature
  static bool verifySignature({
    required String signature,
    required String protocolVersion,
    required String merchantId,
    required String terminalId,
    required String batchId,
    required int timestamp,
    required String nonce,
    int transactionCount = 1,
    required String secretKey,
  }) {
    final expected = generateSignature(
      protocolVersion: protocolVersion,
      merchantId: merchantId,
      terminalId: terminalId,
      batchId: batchId,
      timestamp: timestamp,
      nonce: nonce,
      transactionCount: transactionCount,
      secretKey: secretKey,
    );
    return signature == expected;
  }

  /// Hash data with SHA-256
  static String sha256Hash(String data) {
    final bytes = utf8.encode(data);
    final digest = sha256.convert(bytes);
    return base64Encode(digest.bytes);
  }

  /// Generate a secure random string
  static String generateSecureRandom(int length) {
    final random = Random.secure();
    final values = List<int>.generate(length, (i) => random.nextInt(256));
    return base64UrlEncode(values).substring(0, length);
  }
}
