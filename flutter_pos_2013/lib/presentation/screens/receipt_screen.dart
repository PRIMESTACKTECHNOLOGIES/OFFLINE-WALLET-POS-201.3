import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/date_util.dart';

class ReceiptScreen extends StatelessWidget {
  final double amount;
  final String stan;
  final String txnId;
  final String? settlementCode;
  final String status;
  final bool isOffline;

  const ReceiptScreen({
    super.key,
    required this.amount,
    required this.stan,
    required this.txnId,
    this.settlementCode,
    required this.status,
    required this.isOffline,
  });

  String get _qrData => '''
Transaction Receipt
Amount: ${_currencyFormatter.format(amount)}
STAN: $stan
ID: $txnId
Status: $status
${settlementCode != null ? 'Code: $settlementCode' : ''}
'''.trim();

  final _currencyFormatter = NumberFormat.currency(symbol: '\$');
  final _dateFormat = DateFormat('MMM dd, yyyy HH:mm:ss');

  @override
  Widget build(BuildContext context) {
    final isApproved = status.toUpperCase() == 'APPROVED';
    final statusColor = isApproved ? AppTheme.successColor : AppTheme.pendingColor;

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        title: const Text('Receipt'),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.share),
            onPressed: _shareReceipt,
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Receipt Card
            Card(
              elevation: 4,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    // Status Icon
                    Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: statusColor.withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        isApproved ? Icons.check_circle : Icons.schedule,
                        size: 48,
                        color: statusColor,
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Status Text
                    Text(
                      status,
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: statusColor,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      isOffline ? 'Stored Offline' : 'Transaction Complete',
                      style: TextStyle(
                        color: Colors.grey.shade600,
                      ),
                    ),
                    const SizedBox(height: 32),
                    // Amount
                    Text(
                      _currencyFormatter.format(amount),
                      style: const TextStyle(
                        fontSize: 48,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 32),
                    // Divider
                    Divider(color: Colors.grey.shade300),
                    const SizedBox(height: 16),
                    // Details
                    _buildDetailRow('Transaction ID', txnId),
                    _buildDetailRow('STAN', stan),
                    _buildDetailRow('Date', _dateFormat.format(DateTime.now())),
                    if (settlementCode != null && settlementCode!.isNotEmpty)
                      _buildDetailRow('Settlement Code', settlementCode!, isHighlighted: true),
                    _buildDetailRow('Mode', isOffline ? 'Offline' : 'Online'),
                    const SizedBox(height: 32),
                    // QR Code
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.grey.shade300),
                      ),
                      child: QrImageView(
                        data: _qrData,
                        version: QrVersions.auto,
                        size: 180,
                        backgroundColor: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Scan to verify transaction',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            // Actions
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _shareReceipt,
                    icon: const Icon(Icons.share),
                    label: const Text('Share'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => context.go('/main'),
                    icon: const Icon(Icons.done),
                    label: const Text('Done'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value, {bool isHighlighted = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.grey.shade600,
              fontSize: 14,
            ),
          ),
          Flexible(
            child: Text(
              value,
              style: TextStyle(
                fontWeight: isHighlighted ? FontWeight.bold : FontWeight.w500,
                fontSize: isHighlighted ? 16 : 14,
                color: isHighlighted ? AppTheme.primaryColor : null,
              ),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }

  void _shareReceipt() {
    final text = '''
🧾 Transaction Receipt

Amount: ${_currencyFormatter.format(amount)}
Status: $status
Transaction ID: $txnId
STAN: $stan
Date: ${_dateFormat.format(DateTime.now())}
${settlementCode != null ? 'Settlement Code: $settlementCode\n' : ''}
Thank you for your business!
'''.trim();

    Share.share(text);
  }
}
