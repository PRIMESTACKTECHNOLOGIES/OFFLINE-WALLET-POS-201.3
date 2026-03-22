import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class RedeemDialog extends StatefulWidget {
  final Function(String code, double amount) onSubmit;

  const RedeemDialog({
    super.key,
    required this.onSubmit,
  });

  @override
  State<RedeemDialog> createState() => _RedeemDialogState();
}

class _RedeemDialogState extends State<RedeemDialog> {
  final _codeController = TextEditingController();
  final _amountController = TextEditingController();

  @override
  void dispose() {
    _codeController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  String? _validateCode(String? value) {
    if (value?.length != 6) {
      return 'Code must be 6 digits';
    }
    return null;
  }

  void _onSubmit() {
    final code = _codeController.text;
    final amount = double.tryParse(_amountController.text) ?? 0;
    
    if (code.length == 6 && amount > 0) {
      Navigator.pop(context);
      widget.onSubmit(code, amount);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Redeem Payment Code'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _codeController,
              decoration: const InputDecoration(
                labelText: '6-Digit Code',
                hintText: '123456',
                prefixIcon: Icon(Icons.confirmation_number),
              ),
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(6),
              ],
              maxLength: 6,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _amountController,
              decoration: const InputDecoration(
                labelText: 'Amount',
                hintText: '0.00',
                prefixIcon: Icon(Icons.attach_money),
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}')),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _onSubmit,
          child: const Text('Redeem'),
        ),
      ],
    );
  }
}
