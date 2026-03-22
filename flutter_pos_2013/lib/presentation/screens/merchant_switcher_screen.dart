import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_theme.dart';
import '../../data/model/auth_model.dart';
import '../../data/repository/merchant_repository.dart';
import '../bloc/auth_bloc.dart';

class MerchantSwitcherScreen extends StatelessWidget {
  const MerchantSwitcherScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final merchants = MerchantRepository.getMerchants();
    final current = MerchantRepository.getCurrentMerchant();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Switch Merchant'),
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            color: AppTheme.primaryColor.withOpacity(0.1),
            child: Row(
              children: [
                const Icon(Icons.business, color: AppTheme.primaryColor),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Current Merchant',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondaryColor,
                        ),
                      ),
                      Text(
                        current?.merchantId ?? 'Not selected',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        current?.terminalId ?? '',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: merchants.isEmpty
                ? const Center(
                    child: Text('No merchants configured'),
                  )
                : ListView.builder(
                    itemCount: merchants.length,
                    itemBuilder: (context, index) {
                      final merchant = merchants[index];
                      final isSelected = merchant.merchantId == current?.merchantId;

                      return Card(
                        margin: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 8,
                        ),
                        color: isSelected 
                            ? AppTheme.primaryColor.withOpacity(0.1) 
                            : null,
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: isSelected 
                                ? AppTheme.primaryColor 
                                : Colors.grey.shade300,
                            child: Text(
                              merchant.merchantId.substring(0, 1),
                              style: TextStyle(
                                color: isSelected ? Colors.white : Colors.black,
                              ),
                            ),
                          ),
                          title: Text(
                            merchant.merchantId,
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(merchant.terminalId),
                          trailing: isSelected
                              ? const Icon(
                                  Icons.check_circle,
                                  color: AppTheme.primaryColor,
                                )
                              : null,
                          onTap: isSelected
                              ? null
                              : () => _switchMerchant(context, merchant),
                        ),
                      );
                    },
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => _addNewMerchant(context),
                icon: const Icon(Icons.add_business),
                label: const Text('Add New Merchant'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _switchMerchant(BuildContext context, TerminalInfo merchant) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const AlertDialog(
        content: Row(
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('Switching merchant...'),
          ],
        ),
      ),
    );

    try {
      await MerchantRepository.switchMerchant(merchant.merchantId);
      Navigator.pop(context); // Close loading
      
      // Refresh auth state
      context.read<AuthBloc>().add(CheckAuthStatus());
      
      context.go('/main');
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Switched to ${merchant.merchantId}'),
          backgroundColor: AppTheme.successColor,
        ),
      );
    } catch (e) {
      Navigator.pop(context); // Close loading
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to switch: $e'),
          backgroundColor: AppTheme.errorColor,
        ),
      );
    }
  }

  void _addNewMerchant(BuildContext context) {
    context.go('/setup');
  }
}
