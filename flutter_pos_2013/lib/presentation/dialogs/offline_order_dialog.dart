import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

class OfflineOrderDialog extends StatefulWidget {
  final double amount;
  final Function(String name, String phone) onSubmit;

  const OfflineOrderDialog({
    super.key,
    required this.amount,
    required this.onSubmit,
  });

  @override
  State<OfflineOrderDialog> createState() => _OfflineOrderDialogState();
}

class _OfflineOrderDialogState extends State<OfflineOrderDialog> {
  final _nameController = TextEditingController(text: 'Customer');
  final _phoneController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  String? _validatePhone(String? value) {
    if (value?.isEmpty ?? true) {
      return 'Phone number is required';
    }
    return null;
  }

  void _onSubmit() {
    if (_phoneController.text.isNotEmpty) {
      Navigator.pop(context);
      widget.onSubmit(
        _nameController.text.isEmpty ? 'Customer' : _nameController.text,
        _phoneController.text,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final currencyFormatter = NumberFormat.currency(symbol: '\$');

    return AlertDialog(
      title: const Text('Create Offline Order'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Amount: ${currencyFormatter.format(widget.amount)}',
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.orange.shade200),
              ),
              child: Row(
                children: [
                  Icon(Icons.wifi_off, color: Colors.orange.shade700),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'No internet connection. Order will be saved and payment link will be sent automatically when you go online.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.orange.shade700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Customer Name',
                hintText: 'Enter customer name',
                prefixIcon: Icon(Icons.person),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _phoneController,
              decoration: const InputDecoration(
                labelText: 'Phone Number *',
                hintText: '+971 50 123 4567',
                prefixIcon: Icon(Icons.phone),
              ),
              keyboardType: TextInputType.phone,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton.icon(
          onPressed: _onSubmit,
          icon: const Icon(Icons.save),
          label: const Text('Save Order'),
        ),
      ],
    );
  }
}
