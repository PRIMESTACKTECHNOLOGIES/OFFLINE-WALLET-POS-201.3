import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/config/gateway_config.dart';
import '../../core/theme/app_theme.dart';
import '../bloc/auth_bloc.dart';
import '../bloc/pos_bloc.dart';

class SettingsDialog extends StatefulWidget {
  const SettingsDialog({super.key});

  @override
  State<SettingsDialog> createState() => _SettingsDialogState();
}

class _SettingsDialogState extends State<SettingsDialog> {
  bool _isMyFatoorahExpanded = false;
  final _tokenController = TextEditingController();
  bool _testMode = true;

  @override
  void dispose() {
    _tokenController.dispose();
    super.dispose();
  }

  void _saveMyFatoorahConfig() {
    if (_tokenController.text.isNotEmpty) {
      context.read<AuthBloc>().add(UpdateMyFatoorahConfig(
        token: _tokenController.text,
        testMode: _testMode,
      ));
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('MyFatoorah configured successfully')),
      );
    }
  }

  void _logout() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              Navigator.pop(context);
              context.read<AuthBloc>().add(Logout());
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.errorColor,
            ),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.settings),
          const SizedBox(width: 8),
          const Text('Settings'),
          const Spacer(),
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: ListView(
          shrinkWrap: true,
          children: [
            // MyFatoorah Configuration
            ExpansionTile(
              title: const Text('MyFatoorah Configuration'),
              subtitle: const Text('Configure payment gateway'),
              leading: const Icon(Icons.payment),
              onExpansionChanged: (expanded) {
                setState(() => _isMyFatoorahExpanded = expanded);
              },
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      TextField(
                        controller: _tokenController,
                        decoration: const InputDecoration(
                          labelText: 'API Token',
                          hintText: 'Enter MyFatoorah API token',
                        ),
                        obscureText: true,
                      ),
                      const SizedBox(height: 8),
                      SwitchListTile(
                        title: const Text('Test Mode'),
                        subtitle: const Text('Use sandbox environment'),
                        value: _testMode,
                        onChanged: (value) => setState(() => _testMode = value),
                      ),
                      const SizedBox(height: 8),
                      ElevatedButton.icon(
                        onPressed: _saveMyFatoorahConfig,
                        icon: const Icon(Icons.save),
                        label: const Text('Save Configuration'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            
            // Sync Now
            ListTile(
              leading: const Icon(Icons.sync),
              title: const Text('Sync Now'),
              subtitle: const Text('Upload pending transactions'),
              onTap: () {
                Navigator.pop(context);
                context.read<PosBloc>().add(SyncTransactions());
              },
            ),
            
            // Process Offline Orders
            ListTile(
              leading: const Icon(Icons.schedule_send),
              title: const Text('Process Offline Orders'),
              subtitle: const Text('Send payment links for pending orders'),
              onTap: () {
                Navigator.pop(context);
                context.read<PosBloc>().add(ProcessOfflineOrders());
              },
            ),
            
            // Check Payments
            ListTile(
              leading: const Icon(Icons.payment),
              title: const Text('Check Payments'),
              subtitle: const Text('Check status of sent payment links'),
              onTap: () {
                Navigator.pop(context);
                context.read<PosBloc>().add(CheckOfflinePayments());
              },
            ),
            
            const Divider(),
            
            // Logout
            ListTile(
              leading: const Icon(Icons.logout, color: AppTheme.errorColor),
              title: const Text(
                'Logout',
                style: TextStyle(color: AppTheme.errorColor),
              ),
              onTap: _logout,
            ),
          ],
        ),
      ),
    );
  }
}
