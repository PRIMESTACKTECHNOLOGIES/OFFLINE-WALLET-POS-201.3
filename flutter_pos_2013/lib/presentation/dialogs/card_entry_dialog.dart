import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/encryption_util.dart';

class CardEntryDialog extends StatefulWidget {
  final double amount;
  final Function(String cardNumber, String expiry, String? cvv) onSubmit;

  const CardEntryDialog({
    super.key,
    required this.amount,
    required this.onSubmit,
  });

  @override
  State<CardEntryDialog> createState() => _CardEntryDialogState();
}

class _CardEntryDialogState extends State<CardEntryDialog> {
  final _formKey = GlobalKey<FormState>();
  final _cardController = TextEditingController();
  final _expiryController = TextEditingController();
  final _cvvController = TextEditingController();
  
  bool _obscureCard = false;
  String _cardType = 'unknown';

  @override
  void initState() {
    super.initState();
    _cardController.addListener(_onCardChanged);
  }

  @override
  void dispose() {
    _cardController.removeListener(_onCardChanged);
    _cardController.dispose();
    _expiryController.dispose();
    _cvvController.dispose();
    super.dispose();
  }

  void _onCardChanged() {
    final card = _cardController.text.replaceAll(' ', '');
    setState(() {
      _cardType = EncryptionUtil.getCardType(card);
    });
  }

  String? _validateCard(String? value) {
    if (value?.isEmpty ?? true) {
      return 'Card number is required';
    }
    final card = value!.replaceAll(' ', '');
    if (card.length < 13) {
      return 'Invalid card number';
    }
    if (!EncryptionUtil.validateCardNumber(card)) {
      return 'Invalid card number (Luhn check failed)';
    }
    return null;
  }

  String? _validateExpiry(String? value) {
    if (value?.isEmpty ?? true) {
      return 'Expiry date is required';
    }
    // Format: MM/YY
    final parts = value!.split('/');
    if (parts.length != 2) {
      return 'Invalid format (MM/YY)';
    }
    final month = int.tryParse(parts[0]);
    final year = int.tryParse(parts[1]);
    if (month == null || year == null) {
      return 'Invalid date';
    }
    if (month < 1 || month > 12) {
      return 'Invalid month';
    }
    // Convert 2-digit year to 4-digit
    final fullYear = year < 50 ? 2000 + year : 1900 + year;
    if (!DateUtil.isExpiryValid(month, fullYear)) {
      return 'Card has expired';
    }
    return null;
  }

  IconData get _cardIcon {
    switch (_cardType) {
      case 'visa':
        return Icons.credit_card;
      case 'mastercard':
        return Icons.credit_card;
      case 'amex':
        return Icons.credit_card;
      default:
        return Icons.credit_card;
    }
  }

  void _onSubmit() {
    if (_formKey.currentState?.validate() ?? false) {
      Navigator.pop(context);
      widget.onSubmit(
        _cardController.text.replaceAll(' ', ''),
        _expiryController.text,
        _cvvController.text.isEmpty ? null : _cvvController.text,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Enter Card Details'),
      content: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Card Number
              TextFormField(
                controller: _cardController,
                decoration: InputDecoration(
                  labelText: 'Card Number',
                  hintText: '1234 5678 9012 3456',
                  prefixIcon: Icon(_cardIcon),
                  suffixIcon: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_cardController.text.isNotEmpty)
                        IconButton(
                          icon: Icon(_obscureCard ? Icons.visibility : Icons.visibility_off),
                          onPressed: () => setState(() => _obscureCard = !_obscureCard),
                        ),
                    ],
                  ),
                ),
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  _CardNumberFormatter(),
                ],
                obscureText: _obscureCard,
                validator: _validateCard,
                maxLength: 23, // 16 digits + 4 spaces + 3 for safety
              ),
              const SizedBox(height: 16),
              // Expiry and CVV
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _expiryController,
                      decoration: const InputDecoration(
                        labelText: 'Expiry',
                        hintText: 'MM/YY',
                      ),
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        _ExpiryDateFormatter(),
                      ],
                      validator: _validateExpiry,
                      maxLength: 5,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _cvvController,
                      decoration: const InputDecoration(
                        labelText: 'CVV',
                        hintText: '123',
                      ),
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(4),
                      ],
                      obscureText: true,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              // Security notice
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.security, size: 16, color: Colors.grey.shade600),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Your card data is encrypted and never stored on our servers.',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _onSubmit,
          child: const Text('Process'),
        ),
      ],
    );
  }
}

class _CardNumberFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final text = newValue.text.replaceAll(' ', '');
    final buffer = StringBuffer();
    
    for (var i = 0; i < text.length; i++) {
      if (i > 0 && i % 4 == 0) buffer.write(' ');
      buffer.write(text[i]);
    }
    
    return TextEditingValue(
      text: buffer.toString(),
      selection: TextSelection.collapsed(offset: buffer.length),
    );
  }
}

class _ExpiryDateFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    var text = newValue.text.replaceAll('/', '');
    
    if (text.length >= 2) {
      text = '${text.substring(0, 2)}/${text.substring(2)}';
    }
    
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

// Add missing import
class DateUtil {
  static bool isExpiryValid(int month, int year) {
    final now = DateTime.now();
    final expiry = DateTime(year, month + 1, 0);
    return expiry.isAfter(now);
  }
}
