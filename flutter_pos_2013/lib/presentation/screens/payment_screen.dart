import 'package:flutter/material.dart';
import '../../domain/models/card_data.dart';
import '../../domain/services/payment_service.dart';
import '../../data/repositories/sqlite_card_repository.dart';
import '../../data/repositories/sqlite_transaction_repository.dart';
import '../../data/services/aes_crypto.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final _panController = TextEditingController();
  final _expiryController = TextEditingController();
  final _cvvController = TextEditingController();
  final _amountController = TextEditingController();
  final _nameController = TextEditingController();

  bool _loading = false;
  late final PaymentService _paymentService;

  @override
  void initState() {
    super.initState();
    _paymentService = PaymentService(
      cardRepo: SqliteCardRepository(),
      txnRepo: SqliteTransactionRepository(),
      crypto: AesCryptoService(),
    );
  }

  @override
  void dispose() {
    _panController.dispose();
    _expiryController.dispose();
    _cvvController.dispose();
    _amountController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _processPayment() async {
    setState(() => _loading = true);

    try {
      final pan = _panController.text.replaceAll(' ', '');
      final expiry = _expiryController.text;
      final cvv = _cvvController.text;
      final amount = double.tryParse(_amountController.text) ?? 0;
      final name = _nameController.text;

      // Parse expiry MM/YY
      final expiryParts = expiry.split('/');
      if (expiryParts.length != 2) {
        throw Exception('Invalid expiry format. Use MM/YY');
      }
      
      final month = int.tryParse(expiryParts[0]) ?? 0;
      final year = int.tryParse(expiryParts[1]) ?? 0;
      final fullYear = year < 100 ? 2000 + year : year;

      if (pan.length < 13) {
        throw Exception('Invalid card number');
      }

      if (amount <= 0) {
        throw Exception('Invalid amount');
      }

      // Create offline transaction
      final txnId = await _paymentService.createOfflineTransaction(
        card: CardData(
          cardNumber: pan,
          expiryMonth: month,
          expiryYear: fullYear,
          cvv: cvv,
          cardholderName: name.isEmpty ? null : name,
        ),
        amountCents: (amount * 100).round(),
        currency: 'USD',
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Payment saved offline. TXN: $txnId'),
            backgroundColor: Colors.green,
          ),
        );
        
        // Clear fields
        _panController.clear();
        _expiryController.clear();
        _cvvController.clear();
        _amountController.clear();
        _nameController.clear();
      }

    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Manual Payment'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => Navigator.pushNamed(context, '/settings'),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    TextField(
                      controller: _panController,
                      decoration: const InputDecoration(
                        labelText: 'Card Number',
                        hintText: '4111 1111 1111 1111',
                        prefixIcon: Icon(Icons.credit_card),
                      ),
                      keyboardType: TextInputType.number,
                      maxLength: 19,
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _expiryController,
                            decoration: const InputDecoration(
                              labelText: 'Expiry (MM/YY)',
                              hintText: '12/28',
                            ),
                            keyboardType: TextInputType.number,
                            maxLength: 5,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: TextField(
                            controller: _cvvController,
                            decoration: const InputDecoration(
                              labelText: 'CVV',
                              hintText: '123',
                            ),
                            keyboardType: TextInputType.number,
                            maxLength: 4,
                            obscureText: true,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _nameController,
                      decoration: const InputDecoration(
                        labelText: 'Cardholder Name (Optional)',
                        hintText: 'John Doe',
                      ),
                      textCapitalization: TextCapitalization.words,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    TextField(
                      controller: _amountController,
                      decoration: const InputDecoration(
                        labelText: 'Amount',
                        hintText: '25.00',
                        prefixText: '\$ ',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 32),
            ElevatedButton.icon(
              onPressed: _loading ? null : _processPayment,
              icon: _loading 
                ? const SizedBox(
                    width: 20, 
                    height: 20, 
                    child: CircularProgressIndicator(strokeWidth: 2)
                  )
                : const Icon(Icons.save),
              label: Text(_loading ? 'Processing...' : 'Process Offline Payment'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: () => Navigator.pushNamed(context, '/dashboard'),
              icon: const Icon(Icons.dashboard),
              label: const Text('View Sync Dashboard'),
            ),
          ],
        ),
      ),
    );
  }
}
