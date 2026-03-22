import 'package:equatable/equatable.dart';

/// Transaction Model for local storage and API
class TransactionModel extends Equatable {
  final String id;
  final String localTxnId;
  final String stan;
  final int amountMinor;
  final String currency;
  final String? encryptedPan;
  final String cardLast4;
  final String? cardExpiry;
  final String txnType;
  final String entryMode;
  final int timestamp;
  final String? txnTimestamp;
  final String syncStatus;
  final bool synced;
  final String? settlementCode;
  final String? errorMessage;

  const TransactionModel({
    required this.id,
    required this.localTxnId,
    required this.stan,
    required this.amountMinor,
    this.currency = 'USD',
    this.encryptedPan,
    required this.cardLast4,
    this.cardExpiry,
    this.txnType = 'SALE',
    this.entryMode = 'MANUAL',
    required this.timestamp,
    this.txnTimestamp,
    this.syncStatus = 'PENDING',
    this.synced = false,
    this.settlementCode,
    this.errorMessage,
  });

  TransactionModel copyWith({
    String? id,
    String? localTxnId,
    String? stan,
    int? amountMinor,
    String? currency,
    String? encryptedPan,
    String? cardLast4,
    String? cardExpiry,
    String? txnType,
    String? entryMode,
    int? timestamp,
    String? txnTimestamp,
    String? syncStatus,
    bool? synced,
    String? settlementCode,
    String? errorMessage,
  }) {
    return TransactionModel(
      id: id ?? this.id,
      localTxnId: localTxnId ?? this.localTxnId,
      stan: stan ?? this.stan,
      amountMinor: amountMinor ?? this.amountMinor,
      currency: currency ?? this.currency,
      encryptedPan: encryptedPan ?? this.encryptedPan,
      cardLast4: cardLast4 ?? this.cardLast4,
      cardExpiry: cardExpiry ?? this.cardExpiry,
      txnType: txnType ?? this.txnType,
      entryMode: entryMode ?? this.entryMode,
      timestamp: timestamp ?? this.timestamp,
      txnTimestamp: txnTimestamp ?? this.txnTimestamp,
      syncStatus: syncStatus ?? this.syncStatus,
      synced: synced ?? this.synced,
      settlementCode: settlementCode ?? this.settlementCode,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'localTxnId': localTxnId,
      'stan': stan,
      'amountMinor': amountMinor,
      'currency': currency,
      'encryptedPan': encryptedPan,
      'cardLast4': cardLast4,
      'cardExpiry': cardExpiry,
      'txnType': txnType,
      'entryMode': entryMode,
      'timestamp': timestamp,
      'txnTimestamp': txnTimestamp,
      'syncStatus': syncStatus,
      'synced': synced ? 1 : 0,
      'settlementCode': settlementCode,
      'errorMessage': errorMessage,
    };
  }

  factory TransactionModel.fromMap(Map<String, dynamic> map) {
    return TransactionModel(
      id: map['id'] as String,
      localTxnId: map['localTxnId'] as String,
      stan: map['stan'] as String,
      amountMinor: map['amountMinor'] as int,
      currency: map['currency'] as String? ?? 'USD',
      encryptedPan: map['encryptedPan'] as String?,
      cardLast4: map['cardLast4'] as String,
      cardExpiry: map['cardExpiry'] as String?,
      txnType: map['txnType'] as String? ?? 'SALE',
      entryMode: map['entryMode'] as String? ?? 'MANUAL',
      timestamp: map['timestamp'] as int,
      txnTimestamp: map['txnTimestamp'] as String?,
      syncStatus: map['syncStatus'] as String? ?? 'PENDING',
      synced: map['synced'] == 1,
      settlementCode: map['settlementCode'] as String?,
      errorMessage: map['errorMessage'] as String?,
    );
  }

  /// Get amount as double
  double get amount => amountMinor / 100.0;

  /// Get masked PAN for display
  String get maskedPan {
    if (cardLast4.isEmpty) return '****';
    return '**** **** **** $cardLast4';
  }

  @override
  List<Object?> get props => [
    id, localTxnId, stan, amountMinor, currency,
    encryptedPan, cardLast4, cardExpiry, txnType, entryMode,
    timestamp, syncStatus, synced, settlementCode,
  ];
}

/// Batch Upload Request Model
class BatchUploadRequest extends Equatable {
  final String protocolVersion;
  final String merchantId;
  final String terminalId;
  final String batchId;
  final int timestamp;
  final String nonce;
  final List<TransactionRequest> transactions;
  final String signature;

  const BatchUploadRequest({
    this.protocolVersion = '201.3',
    required this.merchantId,
    required this.terminalId,
    required this.batchId,
    required this.timestamp,
    required this.nonce,
    required this.transactions,
    required this.signature,
  });

  Map<String, dynamic> toJson() {
    return {
      'protocolVersion': protocolVersion,
      'merchantId': merchantId,
      'terminalId': terminalId,
      'batchId': batchId,
      'timestamp': timestamp,
      'nonce': nonce,
      'transactions': transactions.map((t) => t.toJson()).toList(),
      'signature': signature,
    };
  }

  @override
  List<Object?> get props => [
    protocolVersion, merchantId, terminalId, batchId,
    timestamp, nonce, transactions, signature,
  ];
}

/// Individual Transaction Request
class TransactionRequest extends Equatable {
  final String localTxnId;
  final String stan;
  final int amountMinor;
  final String currency;
  final String? encryptedPan;
  final String cardLast4;
  final String? pan;
  final String? expiry;
  final String txnType;
  final String entryMode;
  final String txnTimestamp;

  const TransactionRequest({
    required this.localTxnId,
    required this.stan,
    required this.amountMinor,
    this.currency = 'USD',
    this.encryptedPan,
    required this.cardLast4,
    this.pan,
    this.expiry,
    this.txnType = 'SALE',
    this.entryMode = 'MANUAL',
    required this.txnTimestamp,
  });

  Map<String, dynamic> toJson() {
    return {
      'localTxnId': localTxnId,
      'stan': stan,
      'amountMinor': amountMinor,
      'currency': currency,
      'encryptedPan': encryptedPan,
      'cardLast4': cardLast4,
      'pan': pan,
      'expiry': expiry,
      'txnType': txnType,
      'entryMode': entryMode,
      'txnTimestamp': txnTimestamp,
    };
  }

  @override
  List<Object?> get props => [
    localTxnId, stan, amountMinor, currency,
    encryptedPan, cardLast4, pan, expiry,
    txnType, entryMode, txnTimestamp,
  ];
}

/// Batch Upload Response
class BatchUploadResponse extends Equatable {
  final bool success;
  final String batchId;
  final String? settlementCode;
  final String? message;
  final int processedCount;
  final int failedCount;
  final String? error;

  const BatchUploadResponse({
    required this.success,
    required this.batchId,
    this.settlementCode,
    this.message,
    this.processedCount = 0,
    this.failedCount = 0,
    this.error,
  });

  factory BatchUploadResponse.fromJson(Map<String, dynamic> json) {
    return BatchUploadResponse(
      success: json['success'] as bool,
      batchId: json['batchId'] as String,
      settlementCode: json['settlementCode'] as String?,
      message: json['message'] as String?,
      processedCount: json['processedCount'] as int? ?? 0,
      failedCount: json['failedCount'] as int? ?? 0,
      error: json['error'] as String?,
    );
  }

  @override
  List<Object?> get props => [
    success, batchId, settlementCode, message,
    processedCount, failedCount, error,
  ];
}
