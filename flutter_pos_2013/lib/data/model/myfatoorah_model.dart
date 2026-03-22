import 'package:equatable/equatable.dart';

/// MyFatoorah Invoice Request
class MyFatoorahInvoiceRequest extends Equatable {
  final double invoiceValue;
  final String customerName;
  final String? customerMobile;
  final String? customerEmail;
  final String callBackUrl;
  final String errorUrl;
  final String language;
  final String displayCurrencyIso;
  final String mobileCountryCode;
  final String? customerReference;
  final List<InvoiceItem>? invoiceItems;

  const MyFatoorahInvoiceRequest({
    required this.invoiceValue,
    this.customerName = 'Customer',
    this.customerMobile,
    this.customerEmail,
    this.callBackUrl = 'https://yourdomain.com/success',
    this.errorUrl = 'https://yourdomain.com/error',
    this.language = 'EN',
    this.displayCurrencyIso = 'AED',
    this.mobileCountryCode = '+971',
    this.customerReference,
    this.invoiceItems,
  });

  Map<String, dynamic> toJson() {
    return {
      'InvoiceValue': invoiceValue,
      'CustomerName': customerName,
      'CustomerMobile': customerMobile,
      'CustomerEmail': customerEmail,
      'CallBackUrl': callBackUrl,
      'ErrorUrl': errorUrl,
      'Language': language,
      'DisplayCurrencyIso': displayCurrencyIso,
      'MobileCountryCode': mobileCountryCode,
      'CustomerReference': customerReference,
      'InvoiceItems': invoiceItems?.map((i) => i.toJson()).toList(),
    };
  }

  @override
  List<Object?> get props => [
    invoiceValue, customerName, customerMobile, customerEmail,
    callBackUrl, errorUrl, language, displayCurrencyIso,
    mobileCountryCode, customerReference, invoiceItems,
  ];
}

/// Invoice Item
class InvoiceItem extends Equatable {
  final String itemName;
  final int quantity;
  final double unitPrice;

  const InvoiceItem({
    required this.itemName,
    required this.quantity,
    required this.unitPrice,
  });

  Map<String, dynamic> toJson() {
    return {
      'ItemName': itemName,
      'Quantity': quantity,
      'UnitPrice': unitPrice,
    };
  }

  @override
  List<Object?> get props => [itemName, quantity, unitPrice];
}

/// MyFatoorah Invoice Response
class MyFatoorahInvoiceResponse extends Equatable {
  final bool isSuccess;
  final String? message;
  final List<ValidationError>? validationErrors;
  final InvoiceData? data;

  const MyFatoorahInvoiceResponse({
    required this.isSuccess,
    this.message,
    this.validationErrors,
    this.data,
  });

  factory MyFatoorahInvoiceResponse.fromJson(Map<String, dynamic> json) {
    return MyFatoorahInvoiceResponse(
      isSuccess: json['IsSuccess'] as bool,
      message: json['Message'] as String?,
      validationErrors: (json['ValidationErrors'] as List?)
          ?.map((e) => ValidationError.fromJson(e as Map<String, dynamic>))
          .toList(),
      data: json['Data'] != null
          ? InvoiceData.fromJson(json['Data'] as Map<String, dynamic>)
          : null,
    );
  }

  @override
  List<Object?> get props => [isSuccess, message, validationErrors, data];
}

/// Invoice Data
class InvoiceData extends Equatable {
  final int invoiceId;
  final String invoiceUrl;
  final String? customerReference;
  final String? userDefinedField;

  const InvoiceData({
    required this.invoiceId,
    required this.invoiceUrl,
    this.customerReference,
    this.userDefinedField,
  });

  factory InvoiceData.fromJson(Map<String, dynamic> json) {
    return InvoiceData(
      invoiceId: json['InvoiceId'] as int,
      invoiceUrl: json['InvoiceURL'] as String,
      customerReference: json['CustomerReference'] as String?,
      userDefinedField: json['UserDefinedField'] as String?,
    );
  }

  @override
  List<Object?> get props => [invoiceId, invoiceUrl, customerReference, userDefinedField];
}

/// Validation Error
class ValidationError extends Equatable {
  final String name;
  final String error;

  const ValidationError({
    required this.name,
    required this.error,
  });

  factory ValidationError.fromJson(Map<String, dynamic> json) {
    return ValidationError(
      name: json['Name'] as String,
      error: json['Error'] as String,
    );
  }

  @override
  List<Object?> get props => [name, error];
}

/// Payment Status Response
class PaymentStatusResponse extends Equatable {
  final bool isSuccess;
  final PaymentData? data;

  const PaymentStatusResponse({
    required this.isSuccess,
    this.data,
  });

  factory PaymentStatusResponse.fromJson(Map<String, dynamic> json) {
    return PaymentStatusResponse(
      isSuccess: json['IsSuccess'] as bool,
      data: json['Data'] != null
          ? PaymentData.fromJson(json['Data'] as Map<String, dynamic>)
          : null,
    );
  }

  @override
  List<Object?> get props => [isSuccess, data];
}

/// Payment Data
class PaymentData extends Equatable {
  final int invoiceId;
  final String invoiceStatus;
  final String? invoiceReference;
  final String? invoiceDisplayValue;
  final String? customerName;
  final String? customerMobile;
  final String? customerEmail;
  final String? transactionDate;
  final String? paymentGateway;
  final String? referenceId;
  final String? trackId;
  final String? transactionId;
  final String? paymentId;
  final String? authorizationId;
  final double? invoiceValue;

  const PaymentData({
    required this.invoiceId,
    required this.invoiceStatus,
    this.invoiceReference,
    this.invoiceDisplayValue,
    this.customerName,
    this.customerMobile,
    this.customerEmail,
    this.transactionDate,
    this.paymentGateway,
    this.referenceId,
    this.trackId,
    this.transactionId,
    this.paymentId,
    this.authorizationId,
    this.invoiceValue,
  });

  factory PaymentData.fromJson(Map<String, dynamic> json) {
    return PaymentData(
      invoiceId: json['InvoiceId'] as int,
      invoiceStatus: json['InvoiceStatus'] as String,
      invoiceReference: json['InvoiceReference'] as String?,
      invoiceDisplayValue: json['InvoiceDisplayValue'] as String?,
      customerName: json['CustomerName'] as String?,
      customerMobile: json['CustomerMobile'] as String?,
      customerEmail: json['CustomerEmail'] as String?,
      transactionDate: json['TransactionDate'] as String?,
      paymentGateway: json['PaymentGateway'] as String?,
      referenceId: json['ReferenceId'] as String?,
      trackId: json['TrackId'] as String?,
      transactionId: json['TransactionId'] as String?,
      paymentId: json['PaymentId'] as String?,
      authorizationId: json['AuthorizationId'] as String?,
      invoiceValue: (json['InvoiceValue'] as num?)?.toDouble(),
    );
  }

  bool get isPaid => invoiceStatus == 'Paid';

  @override
  List<Object?> get props => [
    invoiceId, invoiceStatus, invoiceReference, invoiceDisplayValue,
    customerName, customerMobile, customerEmail, transactionDate,
    paymentGateway, referenceId, trackId, transactionId, paymentId,
    authorizationId, invoiceValue,
  ];
}

/// Offline Order Model
class OfflineOrder extends Equatable {
  final String orderId;
  final double amount;
  final String customerName;
  final String customerPhone;
  final String status; // PENDING, LINK_SENT, PAID
  final int createdAt;
  final int? linkSentAt;
  final String? invoiceId;
  final String? paymentUrl;

  const OfflineOrder({
    required this.orderId,
    required this.amount,
    required this.customerName,
    required this.customerPhone,
    this.status = 'PENDING',
    required this.createdAt,
    this.linkSentAt,
    this.invoiceId,
    this.paymentUrl,
  });

  Map<String, dynamic> toMap() {
    return {
      'orderId': orderId,
      'amount': amount,
      'customerName': customerName,
      'customerPhone': customerPhone,
      'status': status,
      'createdAt': createdAt,
      'linkSentAt': linkSentAt,
      'invoiceId': invoiceId,
      'paymentUrl': paymentUrl,
    };
  }

  factory OfflineOrder.fromMap(Map<String, dynamic> map) {
    return OfflineOrder(
      orderId: map['orderId'] as String,
      amount: map['amount'] as double,
      customerName: map['customerName'] as String,
      customerPhone: map['customerPhone'] as String,
      status: map['status'] as String,
      createdAt: map['createdAt'] as int,
      linkSentAt: map['linkSentAt'] as int?,
      invoiceId: map['invoiceId'] as String?,
      paymentUrl: map['paymentUrl'] as String?,
    );
  }

  OfflineOrder copyWith({
    String? orderId,
    double? amount,
    String? customerName,
    String? customerPhone,
    String? status,
    int? createdAt,
    int? linkSentAt,
    String? invoiceId,
    String? paymentUrl,
  }) {
    return OfflineOrder(
      orderId: orderId ?? this.orderId,
      amount: amount ?? this.amount,
      customerName: customerName ?? this.customerName,
      customerPhone: customerPhone ?? this.customerPhone,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      linkSentAt: linkSentAt ?? this.linkSentAt,
      invoiceId: invoiceId ?? this.invoiceId,
      paymentUrl: paymentUrl ?? this.paymentUrl,
    );
  }

  @override
  List<Object?> get props => [
    orderId, amount, customerName, customerPhone,
    status, createdAt, linkSentAt, invoiceId, paymentUrl,
  ];
}
