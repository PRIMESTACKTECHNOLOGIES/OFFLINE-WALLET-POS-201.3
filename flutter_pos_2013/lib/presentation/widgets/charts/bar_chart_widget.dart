import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';

/// Simple Bar Chart Widget
class BarChartWidget extends StatelessWidget {
  final List<double> data;
  final List<String> labels;
  final Color? barColor;
  final double maxHeight;

  const BarChartWidget({
    super.key,
    required this.data,
    required this.labels,
    this.barColor,
    this.maxHeight = 150,
  });

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) return const SizedBox.shrink();

    final maxValue = data.reduce((a, b) => a > b ? a : b);
    final color = barColor ?? AppTheme.primaryColor;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: List.generate(data.length, (index) {
        final value = data[index];
        final height = maxValue > 0 
            ? (value / maxValue) * maxHeight 
            : 0.0;

        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                // Value label
                Text(
                  '\$${value.toStringAsFixed(0)}',
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                // Bar
                Container(
                  width: double.infinity,
                  height: height,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(4),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                // Label
                Text(
                  labels[index],
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
        );
      }),
    );
  }
}
