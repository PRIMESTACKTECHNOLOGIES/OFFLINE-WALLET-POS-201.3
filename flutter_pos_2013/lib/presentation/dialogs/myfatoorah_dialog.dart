import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

class MyFatoorahDialog extends StatefulWidget {
  final double amount;
  final Function(String name, String? phone) onSubmit;

  const MyFatoorahDialog({
    super.key,
    required this.amount,
    required this.onSubmit,
  });

  @override
  State<MyFatoorahDialog> createState() => _MyFatoorahDialogState();
}

class _MyFatoorahDialogState extends State<MyFatoorahDialog> {
  final _nameController = TextEditingController(text: 'Customer');
  final _phoneController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _onSubmit() {
    if (_nameController.text.isNotEmpty) {
      Navigator.pop(context);
      widget.onSubmit(
        _nameController.text,
        _phoneController.text.isEmpty ? null : _phoneController.text,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final currencyFormatter = NumberFormat.currency(symbol: '\$');

    return AlertDialog(
      title: const Text('MyFatoorah Payment'),
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
            const Text(
              'A payment link will be generated and can be shared with the customer via WhatsApp or SMS.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
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
                labelText: 'Phone Number (Optional)',
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
          icon: const Icon(Icons.link),
          label: const Text('Create Link'),
        ),
      ],
    );
  }
}
