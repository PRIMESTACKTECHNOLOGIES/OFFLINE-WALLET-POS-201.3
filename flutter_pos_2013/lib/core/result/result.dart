import 'package:equatable/equatable.dart';

/// Generic result class for operations that can succeed or fail
abstract class Result<T> extends Equatable {
  const Result();

  bool get isSuccess => this is Success<T>;
  bool get isFailure => this is Failure<T>;

  T? get data => isSuccess ? (this as Success<T>).data : null;
  String? get error => isFailure ? (this as Failure<T>).message : null;

  R when<R>({
    required R Function(T data) success,
    required R Function(String message) failure,
  }) {
    if (this is Success<T>) {
      return success((this as Success<T>).data);
    } else {
      return failure((this as Failure<T>).message);
    }
  }

  R? whenOrNull<R>({
    R Function(T data)? success,
    R Function(String message)? failure,
  }) {
    if (this is Success<T> && success != null) {
      return success((this as Success<T>).data);
    } else if (this is Failure<T> && failure != null) {
      return failure((this as Failure<T>).message);
    }
    return null;
  }
}

class Success<T> extends Result<T> {
  final T data;
  final String? message;

  const Success(this.data, {this.message});

  @override
  List<Object?> get props => [data, message];
}

class Failure<T> extends Result<T> {
  final String message;
  final String? code;
  final dynamic exception;

  const Failure(this.message, {this.code, this.exception});

  @override
  List<Object?> get props => [message, code, exception];
}

/// Payment result types
abstract class PaymentResult extends Equatable {
  const PaymentResult();
}

class PaymentSuccess extends PaymentResult {
  final String localTxnId;
  final String stan;
  final double amount;
  final String? settlementCode;
  final String message;

  const PaymentSuccess({
    required this.localTxnId,
    required this.stan,
    required this.amount,
    this.settlementCode,
    this.message = 'Payment successful',
  });

  @override
  List<Object?> get props => [localTxnId, stan, amount, settlementCode, message];
}

class PaymentPending extends PaymentResult {
  final String localTxnId;
  final String stan;
  final double amount;
  final String message;

  const PaymentPending({
    required this.localTxnId,
    required this.stan,
    required this.amount,
    this.message = 'Payment saved offline',
  });

  @override
  List<Object?> get props => [localTxnId, stan, amount, message];
}

class PaymentError extends PaymentResult {
  final String message;
  final String? code;

  const PaymentError(this.message, {this.code});

  @override
  List<Object?> get props => [message, code];
}

/// Sync result types
class SyncSummary extends Equatable {
  final int total;
  final int synced;
  final int failed;
  final List<String> settlementCodes;

  const SyncSummary({
    required this.total,
    required this.synced,
    required this.failed,
    this.settlementCodes = const [],
  });

  @override
  List<Object?> get props => [total, synced, failed, settlementCodes];
}

/// MyFatoorah result types
abstract class MyFatoorahResult extends Equatable {
  const MyFatoorahResult();
}

class MyFatoorahSuccess extends MyFatoorahResult {
  final String invoiceId;
  final String paymentUrl;
  final String? reference;

  const MyFatoorahSuccess({
    required this.invoiceId,
    required this.paymentUrl,
    this.reference,
  });

  @override
  List<Object?> get props => [invoiceId, paymentUrl, reference];
}

class MyFatoorahError extends MyFatoorahResult {
  final String message;
  final List<String>? validationErrors;

  const MyFatoorahError(this.message, {this.validationErrors});

  @override
  List<Object?> get props => [message, validationErrors];
}

/// Redeem result types
abstract class RedeemResult extends Equatable {
  const RedeemResult();
}

class RedeemSuccess extends RedeemResult {
  final String message;
  final String? reference;
  final String? settlementCode;

  const RedeemSuccess({
    required this.message,
    this.reference,
    this.settlementCode,
  });

  @override
  List<Object?> get props => [message, reference, settlementCode];
}

class RedeemError extends RedeemResult {
  final String message;

  const RedeemError(this.message);

  @override
  List<Object?> get props => [message];
}
