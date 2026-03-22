import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class StatusBar extends StatelessWidget {
  final bool isOnline;
  final int pendingCount;
  final int offlineOrderCount;

  const StatusBar({
    super.key,
    required this.isOnline,
    required this.pendingCount,
    required this.offlineOrderCount,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: isOnline ? AppTheme.onlineColor.withOpacity(0.1) : AppTheme.offlineColor.withOpacity(0.1),
        border: Border(
          bottom: BorderSide(
            color: isOnline ? AppTheme.onlineColor.withOpacity(0.3) : AppTheme.offlineColor.withOpacity(0.3),
          ),
        ),
      ),
      child: Row(
        children: [
          // Online/Offline indicator
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: isOnline ? AppTheme.onlineColor : AppTheme.offlineColor,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            isOnline ? 'Online' : 'Offline',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: isOnline ? AppTheme.onlineColor : AppTheme.offlineColor,
            ),
          ),
          const Spacer(),
          // Pending count
          if (pendingCount > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.pendingColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.sync,
                    size: 14,
                    color: AppTheme.pendingColor,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '$pendingCount pending',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppTheme.pendingColor,
                    ),
                  ),
                ],
              ),
            ),
          if (pendingCount > 0 && offlineOrderCount > 0)
            const SizedBox(width: 8),
          // Offline orders count
          if (offlineOrderCount > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.schedule,
                    size: 14,
                    color: AppTheme.primaryColor,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '$offlineOrderCount orders',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppTheme.primaryColor,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
