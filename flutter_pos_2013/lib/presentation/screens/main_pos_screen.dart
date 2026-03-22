import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/result/result.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/network_util.dart';
import '../bloc/auth_bloc.dart';
import '../bloc/pos_bloc.dart';
import '../dialogs/card_entry_dialog.dart';
import '../dialogs/myfatoorah_dialog.dart';
import '../dialogs/offline_order_dialog.dart';
import '../dialogs/redeem_dialog.dart';
import '../dialogs/settings_dialog.dart';
import '../widgets/amount_display.dart';
import '../widgets/numpad.dart';
import '../widgets/status_bar.dart';

class MainPosScreen extends StatefulWidget {
  const MainPosScreen({super.key});

  @override
  State<MainPosScreen> createState() => _MainPosScreenState();
}

class _MainPosScreenState extends State<MainPosScreen> {
  final _currencyFormatter = NumberFormat.currency(symbol: '\$');
  final _networkUtil = NetworkUtil();
  String _amount = '0.00';
  bool _isOnline = false;

  @override
  void initState() {
    super.initState();
    _networkUtil.initialize();
    _networkUtil.onConnectivityChanged.listen((isOnline) {
      if (mounted) {
        setState(() => _isOnline = isOnline);
      }
    });
    _checkConnectivity();
    context.read<PosBloc>().add(InitializePos());
  }

  Future<void> _checkConnectivity() async {
    final isOnline = await _networkUtil.checkConnectivity();
    if (mounted) {
      setState(() => _isOnline = isOnline);
    }
  }

  @override
  void dispose() {
    _networkUtil.dispose();
    super.dispose();
  }

  void _onNumberPressed(String value) {
    setState(() {
      if (_amount == '0.00' && value != '.') {
        _amount = value;
      } else {
        // Prevent multiple decimals
        if (value == '.' && _amount.contains('.')) return;
        
        // Limit decimal places
        if (_amount.contains('.')) {
          final decimalPart = _amount.split('.')[1];
          if (decimalPart.length >= 2) return;
        }
        
        // Limit total length
        if (_amount.replaceAll('.', '').length >= 9) return;
        
        _amount += value;
      }
    });
  }

  void _onClear() {
    setState(() => _amount = '0.00');
  }

  void _onBackspace() {
    setState(() {
      if (_amount.length > 1) {
        _amount = _amount.substring(0, _amount.length - 1);
        if (_amount.isEmpty || _amount == '.') {
          _amount = '0.00';
        }
      } else {
        _amount = '0.00';
      }
    });
  }

  double get _amountValue => double.tryParse(_amount) ?? 0.0;

  void _showPaymentOptions() {
    if (_amountValue <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter an amount')),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _buildPaymentOptionsSheet(),
    );
  }

  Widget _buildPaymentOptionsSheet() {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.all(24),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Payment Method',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              _currencyFormatter.format(_amountValue),
              style: const TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.bold,
                color: AppTheme.primaryColor,
              ),
            ),
            const SizedBox(height: 24),
            if (_isOnline) ...[
              _PaymentOptionTile(
                icon: Icons.credit_card,
                title: 'Card Payment',
                subtitle: 'Manual card entry',
                color: AppTheme.primaryColor,
                onTap: () {
                  Navigator.pop(context);
                  _showCardEntryDialog();
                },
              ),
              _PaymentOptionTile(
                icon: Icons.link,
                title: 'MyFatoorah',
                subtitle: 'Send payment link',
                color: AppTheme.accentColor,
                onTap: () {
                  Navigator.pop(context);
                  _showMyFatoorahDialog();
                },
              ),
              _PaymentOptionTile(
                icon: Icons.money,
                title: 'Cash',
                subtitle: 'Record cash payment',
                color: Colors.orange,
                onTap: () {
                  Navigator.pop(context);
                  _processCashPayment();
                },
              ),
            ] else ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.offlineColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(Icons.wifi_off, color: AppTheme.offlineColor),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Offline Mode',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: AppTheme.offlineColor,
                            ),
                          ),
                          Text(
                            'Transactions will be stored and synced when online',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _PaymentOptionTile(
                icon: Icons.credit_card,
                title: 'Card Payment (Offline)',
                subtitle: 'Store securely, sync later',
                color: AppTheme.primaryColor,
                onTap: () {
                  Navigator.pop(context);
                  _showCardEntryDialog();
                },
              ),
              _PaymentOptionTile(
                icon: Icons.schedule,
                title: 'Create Offline Order',
                subtitle: 'Send payment link when online',
                color: AppTheme.pendingColor,
                onTap: () {
                  Navigator.pop(context);
                  _showOfflineOrderDialog();
                },
              ),
              _PaymentOptionTile(
                icon: Icons.money,
                title: 'Cash',
                subtitle: 'Record cash payment',
                color: Colors.orange,
                onTap: () {
                  Navigator.pop(context);
                  _processCashPayment();
                },
              ),
            ],
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  void _showCardEntryDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => CardEntryDialog(
        amount: _amountValue,
        onSubmit: (cardNumber, expiry, cvv) {
          context.read<PosBloc>().add(ProcessPayment(
            cardNumber: cardNumber,
            expiry: expiry,
            cvv: cvv,
            amount: _amountValue,
          ));
        },
      ),
    );
  }

  void _showMyFatoorahDialog() {
    showDialog(
      context: context,
      builder: (context) => MyFatoorahDialog(
        amount: _amountValue,
        onSubmit: (name, phone) {
          context.read<PosBloc>().add(CreateMyFatoorahPayment(
            amount: _amountValue,
            customerName: name,
            customerMobile: phone,
          ));
        },
      ),
    );
  }

  void _showOfflineOrderDialog() {
    showDialog(
      context: context,
      builder: (context) => OfflineOrderDialog(
        amount: _amountValue,
        onSubmit: (name, phone) {
          context.read<PosBloc>().add(CreateOfflineOrder(
            amount: _amountValue,
            customerName: name,
            customerPhone: phone,
          ));
        },
      ),
    );
  }

  void _processCashPayment() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cash Payment'),
        content: Text(
          'Amount: ${_currencyFormatter.format(_amountValue)}\n\n'
          'Please collect cash from customer.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              setState(() => _amount = '0.00');
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Cash payment recorded')),
              );
            },
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }

  void _showRedeemDialog() {
    showDialog(
      context: context,
      builder: (context) => RedeemDialog(
        onSubmit: (code, amount) {
          context.read<PosBloc>().add(RedeemCode(
            code: code,
            amount: amount,
          ));
        },
      ),
    );
  }

  void _showSettings() {
    showDialog(
      context: context,
      builder: (context) => const SettingsDialog(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<PosBloc, PosState>(
      listener: (context, state) {
        if (state is PaymentCompleted) {
          _handlePaymentResult(state.result);
        } else if (state is SyncCompleted) {
          _handleSyncResult(state.summary);
        } else if (state is RedeemCompleted) {
          _handleRedeemResult(state.result);
        } else if (state is MyFatoorahPaymentCreated) {
          _handleMyFatoorahResult(state.result);
        } else if (state is OfflineOrderCreated) {
          _handleOfflineOrderCreated(state.order);
        } else if (state is PosError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.message),
              backgroundColor: AppTheme.errorColor,
            ),
          );
        }
      },
      builder: (context, state) {
        final pendingCount = state is PosLoaded ? state.pendingCount : 0;
        final offlineOrderCount = state is PosLoaded ? state.offlineOrderCount : 0;

        return Scaffold(
          appBar: AppBar(
            title: BlocBuilder<AuthBloc, AuthState>(
              builder: (context, authState) {
                if (authState is Authenticated) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        authState.terminalInfo.merchantId,
                        style: const TextStyle(fontSize: 14),
                      ),
                      Text(
                        authState.terminalInfo.terminalId,
                        style: const TextStyle(fontSize: 12),
                      ),
                    ],
                  );
                }
                return const Text('POS-201.3');
              },
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.card_giftcard),
                onPressed: _showRedeemDialog,
                tooltip: 'Redeem Code',
              ),
              if (pendingCount > 0)
                Badge(
                  label: Text('$pendingCount'),
                  child: IconButton(
                    icon: const Icon(Icons.sync),
                    onPressed: () {
                      context.read<PosBloc>().add(SyncTransactions());
                    },
                    tooltip: 'Sync Transactions',
                  ),
                )
              else
                IconButton(
                  icon: const Icon(Icons.sync),
                  onPressed: () {
                    context.read<PosBloc>().add(SyncTransactions());
                  },
                  tooltip: 'Sync Transactions',
                ),
              IconButton(
                icon: const Icon(Icons.settings),
                onPressed: _showSettings,
                tooltip: 'Settings',
              ),
            ],
          ),
          body: Column(
            children: [
              // Status Bar
              StatusBar(
                isOnline: _isOnline,
                pendingCount: pendingCount,
                offlineOrderCount: offlineOrderCount,
              ),
              
              // Amount Display
              Expanded(
                flex: 2,
                child: AmountDisplay(amount: _amount),
              ),
              
              // NumPad
              Expanded(
                flex: 5,
                child: NumPad(
                  onNumberPressed: _onNumberPressed,
                  onClear: _onClear,
                  onBackspace: _onBackspace,
                ),
              ),
              
              // Process Button
              Padding(
                padding: const EdgeInsets.all(16),
                child: SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton.icon(
                    onPressed: state is PosLoading ? null : _showPaymentOptions,
                    icon: state is PaymentProcessing
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : const Icon(Icons.payment),
                    label: Text(
                      state is PaymentProcessing ? 'Processing...' : 'Charge',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _handlePaymentResult(PaymentResult result) {
    if (result is PaymentSuccess) {
      setState(() => _amount = '0.00');
      context.go('/receipt', extra: {
        'amount': result.amount,
        'stan': result.stan,
        'txnId': result.localTxnId,
        'settlementCode': result.settlementCode,
        'status': 'APPROVED',
        'isOffline': false,
      });
    } else if (result is PaymentPending) {
      setState(() => _amount = '0.00');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.message),
          backgroundColor: AppTheme.pendingColor,
        ),
      );
    } else if (result is PaymentError) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.message),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    }
  }

  void _handleSyncResult(SyncSummary summary) {
    final message = 'Synced: ${summary.synced}/${summary.total}';
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  void _handleRedeemResult(RedeemResult result) {
    if (result is RedeemSuccess) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Code Redeemed'),
          content: Text(
            'Reference: ${result.reference ?? 'N/A'}\n'
            'Settlement: ${result.settlementCode ?? 'N/A'}',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    } else if (result is RedeemError) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.message),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    }
  }

  void _handleMyFatoorahResult(MyFatoorahResult result) {
    if (result is MyFatoorahSuccess) {
      setState(() => _amount = '0.00');
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Payment Link Created'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Invoice ID: ${result.invoiceId}'),
              const SizedBox(height: 8),
              Text('URL: ${result.paymentUrl}', maxLines: 2),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                // Open URL
              },
              child: const Text('Open Link'),
            ),
          ],
        ),
      );
    } else if (result is MyFatoorahError) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.message),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    }
  }

  void _handleOfflineOrderCreated(order) {
    setState(() => _amount = '0.00');
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Offline order saved'),
        backgroundColor: AppTheme.successColor,
      ),
    );
  }
}

class _PaymentOptionTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _PaymentOptionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      color: color.withOpacity(0.1),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: color.withOpacity(0.2),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: color),
        ),
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.arrow_forward_ios, size: 16),
      ),
    );
  }
}
