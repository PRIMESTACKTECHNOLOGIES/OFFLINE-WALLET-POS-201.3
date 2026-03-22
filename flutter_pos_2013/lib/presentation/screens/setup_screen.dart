import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_theme.dart';
import '../bloc/auth_bloc.dart';
import '../widgets/custom_button.dart';
import '../widgets/custom_text_field.dart';

class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key});

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _merchantController = TextEditingController();
  final _terminalController = TextEditingController();
  final _secretController = TextEditingController();
  final _serverController = TextEditingController(
    text: 'https://pos-201-3-offline-6-digit-1.onrender.com/',
  );

  bool _isLoading = false;
  bool _obscureSecret = true;

  @override
  void dispose() {
    _merchantController.dispose();
    _terminalController.dispose();
    _secretController.dispose();
    _serverController.dispose();
    super.dispose();
  }

  void _onRegister() {
    if (_formKey.currentState?.validate() ?? false) {
      context.read<AuthBloc>().add(Login(
        merchantId: _merchantController.text.trim(),
        terminalId: _terminalController.text.trim(),
        secretKey: _secretController.text.trim(),
        serverUrl: _serverController.text.trim(),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: BlocConsumer<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is Authenticated) {
            context.go('/main');
          } else if (state is AuthError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: AppTheme.errorColor,
              ),
            );
          }
        },
        builder: (context, state) {
          final isLoading = state is AuthLoading;

          return Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [AppTheme.primaryColor, AppTheme.primaryDarkColor],
              ),
            ),
            child: SafeArea(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: Card(
                    elevation: 8,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Icon
                            Container(
                              width: 80,
                              height: 80,
                              decoration: BoxDecoration(
                                color: AppTheme.primaryColor.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: const Icon(
                                Icons.point_of_sale,
                                size: 48,
                                color: AppTheme.primaryColor,
                              ),
                            ),
                            const SizedBox(height: 24),
                            // Title
                            const Text(
                              'Terminal Setup',
                              style: TextStyle(
                                fontSize: 28,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Enter your terminal credentials to continue',
                              style: TextStyle(
                                color: AppTheme.textSecondaryColor,
                              ),
                            ),
                            const SizedBox(height: 32),
                            // Merchant ID
                            CustomTextField(
                              controller: _merchantController,
                              label: 'Merchant ID',
                              hint: 'e.g., MRC-1001',
                              prefixIcon: Icons.business,
                              validator: (value) {
                                if (value?.isEmpty ?? true) {
                                  return 'Merchant ID is required';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),
                            // Terminal ID
                            CustomTextField(
                              controller: _terminalController,
                              label: 'Terminal ID',
                              hint: 'e.g., T2013-001',
                              prefixIcon: Icons.terminal,
                              validator: (value) {
                                if (value?.isEmpty ?? true) {
                                  return 'Terminal ID is required';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),
                            // Secret Key
                            CustomTextField(
                              controller: _secretController,
                              label: 'Secret Key',
                              hint: 'Your terminal secret key',
                              prefixIcon: Icons.key,
                              obscureText: _obscureSecret,
                              suffixIcon: IconButton(
                                icon: Icon(
                                  _obscureSecret
                                      ? Icons.visibility_off
                                      : Icons.visibility,
                                ),
                                onPressed: () {
                                  setState(() {
                                    _obscureSecret = !_obscureSecret;
                                  });
                                },
                              ),
                              validator: (value) {
                                if (value?.isEmpty ?? true) {
                                  return 'Secret key is required';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),
                            // Server URL
                            CustomTextField(
                              controller: _serverController,
                              label: 'Server URL',
                              hint: 'Backend server URL',
                              prefixIcon: Icons.link,
                              validator: (value) {
                                if (value?.isEmpty ?? true) {
                                  return 'Server URL is required';
                                }
                                if (!value!.startsWith('http')) {
                                  return 'Invalid URL format';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 32),
                            // Register Button
                            CustomButton(
                              text: 'Register Terminal',
                              onPressed: isLoading ? null : _onRegister,
                              isLoading: isLoading,
                              icon: Icons.login,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
