import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import '../../core/config/gateway_config.dart';
import '../model/transaction_model.dart';
import '../model/myfatoorah_model.dart';
import '../model/auth_model.dart';

/// API Service using Dio
class ApiService {
  late Dio _dio;
  late Dio _myFatoorahDio;
  
  ApiService() {
    _initDio();
  }

  void _initDio() {
    _dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));

    // Add logging interceptor
    _dio.interceptors.add(LogInterceptor(
      requestBody: true,
      responseBody: true,
    ));

    // Initialize MyFatoorah Dio
    _myFatoorahDio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));
  }

  /// Update base URL from config
  Future<void> updateBaseUrl() async {
    final url = await GatewayConfig.serverUrl;
    _dio.options.baseUrl = url;
  }

  /// Get current base URL
  Future<String> get baseUrl async => await GatewayConfig.serverUrl;

  // ========== AUTH ENDPOINTS ==========

  /// Verify terminal credentials
  Future<VerifyResponse> verifyCredentials(VerifyRequest request) async {
    await updateBaseUrl();
    try {
      final response = await _dio.post(
        '/merchant/v1/terminal/verify',
        data: request.toJson(),
      );
      return VerifyResponse.fromJson(response.data);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// Check server health
  Future<bool> checkHealth() async {
    await updateBaseUrl();
    try {
      final response = await _dio.get('/');
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }

  // ========== TRANSACTION ENDPOINTS ==========

  /// Upload batch (Protocol 201.3)
  Future<BatchUploadResponse> uploadBatch(BatchUploadRequest request) async {
    await updateBaseUrl();
    try {
      final response = await _dio.post(
        '/merchant/v1/pos/201.3/offline-batch',
        data: request.toJson(),
      );
      return BatchUploadResponse.fromJson(response.data);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// Upload MyFatoorah batch
  Future<BatchUploadResponse> uploadMyFatoorahBatch(BatchUploadRequest request) async {
    await updateBaseUrl();
    try {
      final response = await _dio.post(
        '/merchant/v1/pos/201.3/myfatoorah-batch',
        data: request.toJson(),
      );
      return BatchUploadResponse.fromJson(response.data);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// Redeem payment code
  Future<RedeemResponse> redeemCode(RedeemRequest request) async {
    await updateBaseUrl();
    try {
      final response = await _dio.post(
        '/merchant/v1/payment/redeem',
        data: request.toJson(),
      );
      return RedeemResponse.fromJson(response.data);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // ========== MYFATOORAH ENDPOINTS ==========

  /// Create MyFatoorah invoice
  Future<MyFatoorahInvoiceResponse> createMyFatoorahInvoice(
    MyFatoorahInvoiceRequest request,
  ) async {
    final baseUrl = await GatewayConfig.myFatoorahBaseUrl;
    final authHeader = await GatewayConfig.myFatoorahAuthHeader;

    try {
      final response = await _myFatoorahDio.post(
        '${baseUrl}v2/ExecutePayment',
        data: request.toJson(),
        options: Options(
          headers: {'Authorization': authHeader},
        ),
      );
      return MyFatoorahInvoiceResponse.fromJson(response.data);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// Create payment link (SendPayment endpoint)
  Future<MyFatoorahInvoiceResponse> createPaymentLink(
    MyFatoorahInvoiceRequest request,
  ) async {
    final baseUrl = await GatewayConfig.myFatoorahBaseUrl;
    final authHeader = await GatewayConfig.myFatoorahAuthHeader;

    try {
      final response = await _myFatoorahDio.post(
        '${baseUrl}v2/SendPayment',
        data: request.toJson(),
        options: Options(
          headers: {'Authorization': authHeader},
        ),
      );
      return MyFatoorahInvoiceResponse.fromJson(response.data);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// Check payment status
  Future<PaymentStatusResponse> checkPaymentStatus(int invoiceId) async {
    final baseUrl = await GatewayConfig.myFatoorahBaseUrl;
    final authHeader = await GatewayConfig.myFatoorahAuthHeader;

    try {
      final response = await _myFatoorahDio.post(
        '${baseUrl}v2/GetPaymentStatus',
        data: {'Key': invoiceId.toString(), 'KeyType': 'InvoiceId'},
        options: Options(
          headers: {'Authorization': authHeader},
        ),
      );
      return PaymentStatusResponse.fromJson(response.data);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// Get all MyFatoorah payments
  Future<List<PaymentData>> getAllPayments() async {
    final baseUrl = await GatewayConfig.myFatoorahBaseUrl;
    final authHeader = await GatewayConfig.myFatoorahAuthHeader;

    try {
      final response = await _myFatoorahDio.post(
        '${baseUrl}v2/GetTransactions',
        data: {},
        options: Options(
          headers: {'Authorization': authHeader},
        ),
      );
      
      if (response.data['IsSuccess'] == true && response.data['Data'] != null) {
        final data = response.data['Data'] as List;
        return data.map((item) => PaymentData.fromJson(item)).toList();
      }
      return [];
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // ========== ERROR HANDLING ==========

  Exception _handleError(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return ApiException('Connection timeout. Please try again.');
      
      case DioExceptionType.badResponse:
        final statusCode = error.response?.statusCode;
        final message = error.response?.data?['message'] ?? 
                       error.response?.data?['error'] ??
                       'Server error';
        return ApiException('$message (HTTP $statusCode)');
      
      case DioExceptionType.connectionError:
        return ApiException('No internet connection');
      
      default:
        return ApiException(error.message ?? 'Network error');
    }
  }
}

/// API Exception
class ApiException implements Exception {
  final String message;
  ApiException(this.message);

  @override
  String toString() => 'ApiException: $message';
}
