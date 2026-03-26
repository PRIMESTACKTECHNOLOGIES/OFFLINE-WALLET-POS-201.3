import 'package:dio/dio.dart';
import '../../domain/models/card_data.dart';
import '../../domain/models/gateway_result.dart';
import '../../domain/services/payment_gateway_client.dart';

class HttpGatewayClient implements PaymentGatewayClient {
  final Dio _dio;

  HttpGatewayClient({Dio? dio}) : _dio = dio ?? Dio(BaseOptions(
    baseUrl: 'https://pos-offline-sftwr.onrender.com',
    connectTimeout: Duration(seconds: 30),
    receiveTimeout: Duration(seconds: 30),
  ));

  @override
  Future<GatewayChargeResult> chargeCard(
    String localTxnId,
    int amountCents,
    String currency,
    CardData card,
  ) async {
    try {
      final response = await _dio.post('/api/payments/charge', data: {
        'idempotency_key': localTxnId,
        'amount': amountCents,
        'currency': currency,
        'card': {
          'number': card.cardNumber,
          'expiry_month': card.expiryMonth,
          'expiry_year': card.expiryYear,
          'cvv': card.cvv,
          'cardholder_name': card.cardholderName,
        },
      });

      final data = response.data;
      final status = data['status'];

      if (status == 'SUCCESS') {
        return GatewayChargeResult(
          type: GatewayResultType.SUCCESS,
          gatewayTxnId: data['gateway_txn_id'],
        );
      } else if (status == 'FAILED') {
        return GatewayChargeResult(
          type: GatewayResultType.HARD_FAIL,
          errorCode: data['error_code'],
          errorMessage: data['error_message'],
        );
      } else {
        return GatewayChargeResult(
          type: GatewayResultType.SOFT_FAIL,
          errorCode: data['error_code'] ?? 'UNKNOWN',
          errorMessage: data['error_message'] ?? 'Unknown error',
        );
      }

    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.sendTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.response == null) {
        return GatewayChargeResult(
          type: GatewayResultType.SOFT_FAIL,
          errorCode: 'NETWORK_ERROR',
          errorMessage: e.message ?? 'Network error',
        );
      }
      
      return GatewayChargeResult(
        type: GatewayResultType.HARD_FAIL,
        errorCode: 'HTTP_${e.response?.statusCode}',
        errorMessage: e.message ?? 'HTTP error',
      );
    }
  }
}
