import 'dart:math';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

/// ID Generator for Transactions, Batches, and STAN
class IdGenerator {
  static const String _stanKey = 'current_stan';
  static const int _maxStan = 999999;
  
  /// Generate a unique local transaction ID
  static String generateLocalTxnId() {
    final uuid = const Uuid().v4();
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    return 'TXN-$timestamp-${uuid.substring(0, 8)}';
  }

  /// Generate a 6-digit STAN (System Trace Audit Number)
  static Future<String> generateStan() async {
    final prefs = await SharedPreferences.getInstance();
    int currentStan = prefs.getInt(_stanKey) ?? 0;
    
    // Increment and wrap around
    currentStan = (currentStan + 1) % (_maxStan + 1);
    if (currentStan == 0) currentStan = 1;
    
    await prefs.setInt(_stanKey, currentStan);
    
    return currentStan.toString().padLeft(6, '0');
  }

  /// Generate a batch ID
  static String generateBatchId() {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final random = Random().nextInt(9999).toString().padLeft(4, '0');
    return 'BATCH-$timestamp-$random';
  }

  /// Generate an order ID for offline orders
  static String generateOrderId() {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final random = Random().nextInt(999).toString().padLeft(3, '0');
    return 'ORD-$timestamp-$random';
  }

  /// Generate a settlement code (6-digit)
  static String generateSettlementCode() {
    final random = Random();
    final code = random.nextInt(1000000).toString().padLeft(6, '0');
    return code;
  }

  /// Generate a merchant reference
  static String generateMerchantReference() {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    return 'REF-$timestamp';
  }

  /// Generate a short code for redemption
  static String generateShortCode() {
    final random = Random();
    // Generate 6-digit code
    return random.nextInt(1000000).toString().padLeft(6, '0');
  }

  /// Generate a UUID v4
  static String generateUuid() {
    return const Uuid().v4();
  }

  /// Reset STAN counter (for testing)
  static Future<void> resetStan() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_stanKey, 0);
  }

  /// Get current STAN without incrementing
  static Future<String> getCurrentStan() async {
    final prefs = await SharedPreferences.getInstance();
    int currentStan = prefs.getInt(_stanKey) ?? 0;
    return currentStan.toString().padLeft(6, '0');
  }
}
