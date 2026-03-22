import '../../core/config/gateway_config.dart';
import '../../core/result/result.dart';
import '../../core/utils/date_util.dart';
import '../../core/utils/hmac_util.dart';
import '../../core/utils/id_generator.dart';
import '../../core/utils/encryption_util.dart';
import '../local/database_helper.dart';
import '../model/transaction_model.dart';
import '../remote/api_service.dart';

/// Payment Repository - Handles payment processing and syncing
class PaymentRepository {
  final DatabaseHelper _db;
  final ApiService _api;

  PaymentRepository({
    DatabaseHelper? databaseHelper,
    ApiService? apiService,
  })  : _db = databaseHelper ?? DatabaseHelper(),
        _api = apiService ?? ApiService();

  // ========== PAYMENT PROCESSING ==========

  /// Process a new card payment
  Future<PaymentResult> processPayment({
    required String cardNumber,
    required String expiry,
    String? cvv,
    required double amount,
  }) async {
    try {
      // Convert amount to minor units
      final amountMinor = (amount * 100).round();
      
      // Generate IDs
      final localTxnId = IdGenerator.generateLocalTxnId();
      final stan = await IdGenerator.generateStan();
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      
      // Get card last 4 digits
      final cardLast4 = cardNumber.length >= 4 
          ? cardNumber.substring(cardNumber.length - 4) 
          : cardNumber;

      // Encrypt card data (if needed for storage)
      String? encryptedPan;
      try {
        final encUtil = EncryptionUtil();
        encryptedPan = encUtil.encrypt(cardNumber);
      } catch (e) {
        // Continue without encryption if it fails
        encryptedPan = null;
      }

      // Create transaction model
      final transaction = TransactionModel(
        id: localTxnId,
        localTxnId: localTxnId,
        stan: stan,
        amountMinor: amountMinor,
        encryptedPan: encryptedPan,
        cardLast4: cardLast4,
        cardExpiry: expiry,
        timestamp: timestamp,
        txnTimestamp: DateUtil.toIsoString(DateTime.now()),
        syncStatus: 'PENDING',
        synced: false,
      );

      // Save to local database
      await _db.insertTransaction(transaction);

      // Try to sync immediately
      try {
        final syncResult = await _syncTransaction(transaction);
        if (syncResult is Success<String?>) {
          return PaymentSuccess(
            localTxnId: localTxnId,
            stan: stan,
            amount: amount,
            settlementCode: syncResult.data,
            message: 'Payment processed successfully',
          );
        }
      } catch (e) {
        // Sync failed, keep as pending
      }

      // Return pending result
      return PaymentPending(
        localTxnId: localTxnId,
        stan: stan,
        amount: amount,
        message: 'Payment saved offline. Will sync when online.',
      );

    } catch (e) {
      return PaymentError('Failed to process payment: $e');
    }
  }

  /// Sync a single transaction
  Future<Result<String?>> _syncTransaction(TransactionModel transaction) async {
    try {
      // Update status to syncing
      await _db.updateTransactionStatus(
        transaction.localTxnId,
        status: 'SYNCING',
      );

      // Get config
      final merchantId = await GatewayConfig.merchantId;
      final terminalId = await GatewayConfig.terminalId;
      final secretKey = await GatewayConfig.secretKey;

      // Generate batch data
      final batchId = IdGenerator.generateBatchId();
      final nonce = HmacUtil.generateNonce();
      final timestamp = DateTime.now().millisecondsSinceEpoch;

      // Create transaction request
      final txnRequest = TransactionRequest(
        localTxnId: transaction.localTxnId,
        stan: transaction.stan,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        encryptedPan: transaction.encryptedPan,
        cardLast4: transaction.cardLast4,
        expiry: transaction.cardExpiry,
        txnType: transaction.txnType,
        entryMode: transaction.entryMode,
        txnTimestamp: transaction.txnTimestamp ?? DateUtil.toIsoString(DateTime.now()),
      );

      // Generate signature
      final signature = HmacUtil.generateSignature(
        protocolVersion: '201.3',
        merchantId: merchantId,
        terminalId: terminalId,
        batchId: batchId,
        timestamp: timestamp,
        nonce: nonce,
        transactionCount: 1,
        secretKey: secretKey,
      );

      // Create batch request
      final request = BatchUploadRequest(
        merchantId: merchantId,
        terminalId: terminalId,
        batchId: batchId,
        timestamp: timestamp,
        nonce: nonce,
        transactions: [txnRequest],
        signature: signature,
      );

      // Send to server
      final response = await _api.uploadBatch(request);

      if (response.success) {
        await _db.markAsSynced(
          transaction.localTxnId,
          response.settlementCode ?? '',
        );
        return Success(response.settlementCode);
      } else {
        await _db.updateTransactionStatus(
          transaction.localTxnId,
          status: 'FAILED',
          errorMessage: response.error ?? 'Unknown error',
        );
        return Failure(response.error ?? 'Sync failed');
      }

    } catch (e) {
      await _db.updateTransactionStatus(
        transaction.localTxnId,
        status: 'PENDING',
        errorMessage: e.toString(),
      );
      return Failure('Sync error: $e');
    }
  }

  /// Sync all pending transactions
  Future<SyncSummary> syncPendingTransactions() async {
    final pending = await _db.getPendingTransactions();
    
    int successCount = 0;
    int failedCount = 0;
    final settlementCodes = <String>[];

    for (final transaction in pending) {
      final result = await _syncTransaction(transaction);
      if (result is Success<String?>) {
        successCount++;
        if (result.data != null && result.data!.isNotEmpty) {
          settlementCodes.add(result.data!);
        }
      } else {
        failedCount++;
      }
    }

    return SyncSummary(
      total: pending.length,
      synced: successCount,
      failed: failedCount,
      settlementCodes: settlementCodes,
    );
  }

  // ========== REDEMPTION ==========

  /// Redeem a payment code
  Future<RedeemResult> redeemCode(String code, double amount) async {
    try {
      final merchantId = await GatewayConfig.merchantId;
      
      final request = RedeemRequest(
        code: code,
        amount: amount,
        merchantId: merchantId,
      );

      final response = await _api.redeemCode(request);

      if (response.success) {
        return RedeemSuccess(
          message: response.message ?? 'Payment redeemed successfully',
          reference: response.reference,
          settlementCode: response.settlementCode,
        );
      } else {
        return RedeemError(response.message ?? 'Redemption failed');
      }

    } catch (e) {
      return RedeemError('Error: $e');
    }
  }

  // ========== TRANSACTION QUERIES ==========

  /// Get all transactions
  Future<List<TransactionModel>> getAllTransactions() async {
    return await _db.getAllTransactions();
  }

  /// Get pending transactions
  Future<List<TransactionModel>> getPendingTransactions() async {
    return await _db.getPendingTransactions();
  }

  /// Get pending count
  Future<int> getPendingCount() async {
    return await _db.getPendingCount();
  }

  /// Get transaction by ID
  Future<TransactionModel?> getTransaction(String localTxnId) async {
    return await _db.getTransactionByLocalId(localTxnId);
  }

  // ========== CLEANUP ==========

  /// Clear old synced transactions
  Future<void> clearOldTransactions(int days) async {
    final millis = days * 24 * 60 * 60 * 1000;
    await _db.deleteOldSyncedTransactions(millis);
  }

  /// Delete all data
  Future<void> clearAllData() async {
    await _db.deleteAllTransactions();
    await _db.deleteAllOrders();
  }
}
