import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class NumPad extends StatelessWidget {
  final Function(String) onNumberPressed;
  final VoidCallback onClear;
  final VoidCallback onBackspace;

  const NumPad({
    super.key,
    required this.onNumberPressed,
    required this.onClear,
    required this.onBackspace,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          Expanded(
            child: Row(
              children: [
                _buildNumberButton('1'),
                _buildNumberButton('2'),
                _buildNumberButton('3'),
              ],
            ),
          ),
          Expanded(
            child: Row(
              children: [
                _buildNumberButton('4'),
                _buildNumberButton('5'),
                _buildNumberButton('6'),
              ],
            ),
          ),
          Expanded(
            child: Row(
              children: [
                _buildNumberButton('7'),
                _buildNumberButton('8'),
                _buildNumberButton('9'),
              ],
            ),
          ),
          Expanded(
            child: Row(
              children: [
                _buildActionButton(
                  onPressed: onClear,
                  child: const Text(
                    'C',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.errorColor,
                    ),
                  ),
                ),
                _buildNumberButton('0'),
                _buildActionButton(
                  onPressed: onBackspace,
                  child: const Icon(
                    Icons.backspace_outlined,
                    color: AppTheme.textSecondaryColor,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNumberButton(String number) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          elevation: 2,
          child: InkWell(
            onTap: () => onNumberPressed(number),
            borderRadius: BorderRadius.circular(12),
            child: Center(
              child: Text(
                number,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildActionButton({
    required VoidCallback onPressed,
    required Widget child,
  }) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Material(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(12),
          elevation: 2,
          child: InkWell(
            onTap: onPressed,
            borderRadius: BorderRadius.circular(12),
            child: Center(child: child),
          ),
        ),
      ),
    );
  }
}
