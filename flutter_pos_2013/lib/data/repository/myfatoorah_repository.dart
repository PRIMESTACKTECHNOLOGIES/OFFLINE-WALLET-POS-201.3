import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/config/gateway_config.dart';
import '../../core/result/result.dart';
import '../../core/utils/id_generator.dart';
import '../local/database_helper.dart';
import '../model/myfatoorah_model.dart';
import '../remote/api_service.dart';

/// MyFatoorah Repository - Handles MyFatoorah payment integration
class MyFatoorahRepository {
  final DatabaseHelper _db;
  final ApiService _api;

  MyFatoorahRepository({
    DatabaseHelper? databaseHelper,
    ApiService? apiService,
  })  : _db = databaseHelper ?? DatabaseHelper(),
        _api = apiService ?? ApiService();

  /// Check if MyFatoorah is configured
  Future<bool> get isConfigured async {
    return await GatewayConfig.isMyFatoorahConfigured;
  }

  /// Create a payment link
  Future<MyFatoorahResult> createPaymentLink({
    required double amount,
    String customerName = 'Customer',
    String? customerMobile,
    String? customerEmail,
    String? reference,
    List<InvoiceItem>? items,
  }) async {
    try {
      if (!await isConfigured) {
        return const MyFatoorahError('MyFatoorah not configured');
      }

      final request = MyFatoorahInvoiceRequest(
        invoiceValue: amount,
        customerName: customerName,
        customerMobile: customerMobile,
        customerEmail: customerEmail,
        customerReference: reference ?? IdGenerator.generateMerchantReference(),
        invoiceItems: items ?? [
          InvoiceItem(
            itemName: 'Purchase',
            quantity: 1,
            unitPrice: amount,
          ),
        ],
      );

      final response = await _api.createPaymentLink(request);

      if (response.isSuccess && response.data != null) {
        return MyFatoorahSuccess(
          invoiceId: response.data!.invoiceId,
          paymentUrl: response.data!.invoiceUrl,
          reference: response.data!.customerReference,
        );
      } else {
        final errors = response.validationErrors
            ?.map((e) => '${e.name}: ${e.error}')
            .toList();
        return MyFatoorahError(
          response.message ?? 'Failed to create payment link',
          validationErrors: errors,
        );
      }
    } catch (e) {
      return MyFatoorahError('Error: $e');
    }
  }

  /// Check payment status
  Future<PaymentStatusResponse> checkPaymentStatus(int invoiceId) async {
    try {
      return await _api.checkPaymentStatus(invoiceId);
    } catch (e) {
      return PaymentStatusResponse(
        isSuccess: false,
        data: null,
      );
    }
  }

  /// Open payment link in browser
  Future<bool> openPaymentInBrowser(String url) async {
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        return await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /// Share payment link
  Future<void> sharePaymentLink(String url, String? phoneNumber) async {
    // Copy to clipboard
    await Clipboard.setData(ClipboardData(text: url));
    
    // Try to open WhatsApp if phone number provided
    if (phoneNumber != null && phoneNumber.isNotEmpty) {
      final formattedPhone = phoneNumber.replaceAll(RegExp(r'[^0-9+]'), '');
      final whatsappUrl = 'https://wa.me/$formattedPhone?text=${Uri.encodeComponent(url)}';
      final uri = Uri.parse(whatsappUrl);
      
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    }
  }

  // ========== OFFLINE ORDERS ==========

  /// Create offline order (for when internet is down)
  Future<OfflineOrder> createOfflineOrder({
    required double amount,
    required String customerName,
    required String customerPhone,
  }) async {
    final order = OfflineOrder(
      orderId: IdGenerator.generateOrderId(),
      amount: amount,
      customerName: customerName,
      customerPhone: customerPhone,
      status: 'PENDING',
      createdAt: DateTime.now().millisecondsSinceEpoch,
    );

    await _db.insertOfflineOrder(order);
    return order;
  }

  /// Get pending offline orders
  Future<List<OfflineOrder>> getPendingOrders() async {
    return await _db.getPendingOrders();
  }

  /// Get orders with link sent
  Future<List<OfflineOrder>> getLinkSentOrders() async {
    return await _db.getLinkSentOrders();
  }

  /// Process pending orders (send payment links)
  Future<List<OfflineOrder>> processPendingOrders() async {
    final pending = await _db.getPendingOrders();
    final processed = <OfflineOrder>[];

    for (final order in pending) {
      final result = await createPaymentLink(
        amount: order.amount,
        customerName: order.customerName,
        customerMobile: order.customerPhone,
      );

      if (result is MyFatoorahSuccess) {
        final updatedOrder = order.copyWith(
          status: 'LINK_SENT',
          linkSentAt: DateTime.now().millisecondsSinceEpoch,
          invoiceId: result.invoiceId.toString(),
          paymentUrl: result.paymentUrl,
        );
        await _db.updateOfflineOrder(updatedOrder);
        processed.add(updatedOrder);
      }
    }

    return processed;
  }

  /// Check for paid orders
  Future<List<OfflineOrder>> checkPendingPayments() async {
    final linkSent = await _db.getLinkSentOrders();
    final paid = <OfflineOrder>[];

    for (final order in linkSent) {
      if (order.invoiceId != null) {
        final status = await checkPaymentStatus(int.parse(order.invoiceId!));
        if (status.isSuccess && 
            status.data != null && 
            status.data!.isPaid) {
          final updatedOrder = order.copyWith(status: 'PAID');
          await _db.updateOfflineOrder(updatedOrder);
          paid.add(updatedOrder);
        }
      }
    }

    return paid;
  }

  /// Get pending order count
  Future<int> getPendingCount() async {
    return await _db.getPendingOrderCount();
  }

  /// Get link sent order count
  Future<int> getLinkSentCount() async {
    return await _db.getLinkSentOrderCount();
  }

  /// Clear old orders
  Future<void> clearOldOrders(int days) async {
    await _db.deleteOldOrders(days);
  }
}
