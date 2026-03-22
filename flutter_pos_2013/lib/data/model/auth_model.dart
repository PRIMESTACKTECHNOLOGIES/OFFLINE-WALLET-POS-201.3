import 'package:equatable/equatable.dart';

/// Verify Credentials Request
class VerifyRequest extends Equatable {
  final String merchantId;
  final String terminalId;
  final String secretKey;

  const VerifyRequest({
    required this.merchantId,
    required this.terminalId,
    required this.secretKey,
  });

  Map<String, dynamic> toJson() {
    return {
      'merchantId': merchantId,
      'terminalId': terminalId,
      'secretKey': secretKey,
    };
  }

  @override
  List<Object?> get props => [merchantId, terminalId, secretKey];
}

/// Verify Credentials Response
class VerifyResponse extends Equatable {
  final bool valid;
  final String? merchantId;
  final String? message;
  final String? error;

  const VerifyResponse({
    this.valid = false,
    this.merchantId,
    this.message,
    this.error,
  });

  factory VerifyResponse.fromJson(Map<String, dynamic> json) {
    return VerifyResponse(
      valid: json['valid'] as bool? ?? false,
      merchantId: json['merchantId'] as String?,
      message: json['message'] as String?,
      error: json['error'] as String?,
    );
  }

  @override
  List<Object?> get props => [valid, merchantId, message, error];
}

/// Redeem Request
class RedeemRequest extends Equatable {
  final String code;
  final double amount;
  final String merchantId;

  const RedeemRequest({
    required this.code,
    required this.amount,
    required this.merchantId,
  });

  Map<String, dynamic> toJson() {
    return {
      'code': code,
      'amount': amount,
      'merchantId': merchantId,
    };
  }

  @override
  List<Object?> get props => [code, amount, merchantId];
}

/// Redeem Response
class RedeemResponse extends Equatable {
  final bool success;
  final String? message;
  final String? reference;
  final String? settlementCode;

  const RedeemResponse({
    this.success = false,
    this.message,
    this.reference,
    this.settlementCode,
  });

  factory RedeemResponse.fromJson(Map<String, dynamic> json) {
    return RedeemResponse(
      success: json['success'] as bool? ?? false,
      message: json['message'] as String?,
      reference: json['reference'] as String?,
      settlementCode: json['settlementCode'] as String?,
    );
  }

  @override
  List<Object?> get props => [success, message, reference, settlementCode];
}

/// User/Terminal Info
class TerminalInfo extends Equatable {
  final String merchantId;
  final String terminalId;
  final String serverUrl;
  final String? merchantName;
  final bool isRegistered;
  final DateTime? registeredAt;

  const TerminalInfo({
    required this.merchantId,
    required this.terminalId,
    required this.serverUrl,
    this.merchantName,
    this.isRegistered = false,
    this.registeredAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'merchantId': merchantId,
      'terminalId': terminalId,
      'serverUrl': serverUrl,
      'merchantName': merchantName,
      'isRegistered': isRegistered,
      'registeredAt': registeredAt?.millisecondsSinceEpoch,
    };
  }

  factory TerminalInfo.fromMap(Map<String, dynamic> map) {
    return TerminalInfo(
      merchantId: map['merchantId'] as String,
      terminalId: map['terminalId'] as String,
      serverUrl: map['serverUrl'] as String,
      merchantName: map['merchantName'] as String?,
      isRegistered: map['isRegistered'] as bool? ?? false,
      registeredAt: map['registeredAt'] != null
          ? DateTime.fromMillisecondsSinceEpoch(map['registeredAt'] as int)
          : null,
    );
  }

  TerminalInfo copyWith({
    String? merchantId,
    String? terminalId,
    String? serverUrl,
    String? merchantName,
    bool? isRegistered,
    DateTime? registeredAt,
  }) {
    return TerminalInfo(
      merchantId: merchantId ?? this.merchantId,
      terminalId: terminalId ?? this.terminalId,
      serverUrl: serverUrl ?? this.serverUrl,
      merchantName: merchantName ?? this.merchantName,
      isRegistered: isRegistered ?? this.isRegistered,
      registeredAt: registeredAt ?? this.registeredAt,
    );
  }

  @override
  List<Object?> get props => [
    merchantId, terminalId, serverUrl,
    merchantName, isRegistered, registeredAt,
  ];
}
