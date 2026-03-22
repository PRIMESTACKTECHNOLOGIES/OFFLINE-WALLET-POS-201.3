import '../local/database_helper.dart';
import '../model/transaction_model.dart';

/// Analytics Repository for reports and insights
class AnalyticsRepository {
  final DatabaseHelper _db;

  AnalyticsRepository({DatabaseHelper? db}) : _db = db ?? DatabaseHelper();

  /// Get daily sales summary
  Future<Map<String, dynamic>> getDailySummary(DateTime date) async {
    final startOfDay = DateTime(date.year, date.month, date.day);
    final endOfDay = startOfDay.add(const Duration(days: 1));
    
    final transactions = await _db.getAllTransactions();
    
    final dayTransactions = transactions.where((t) {
      final txnDate = DateTime.fromMillisecondsSinceEpoch(t.timestamp);
      return txnDate.isAfter(startOfDay) && txnDate.isBefore(endOfDay);
    }).toList();

    final totalSales = dayTransactions.fold<int>(
      0, 
      (sum, t) => sum + t.amountMinor
    );
    
    final successful = dayTransactions.where((t) => t.syncStatus == 'SYNCED').length;
    final pending = dayTransactions.where((t) => t.syncStatus == 'PENDING').length;

    return {
      'date': date.toIso8601String(),
      'totalTransactions': dayTransactions.length,
      'totalSales': totalSales / 100.0,
      'successful': successful,
      'pending': pending,
      'failed': dayTransactions.length - successful - pending,
    };
  }

  /// Get weekly sales report
  Future<List<Map<String, dynamic>>> getWeeklyReport() async {
    final now = DateTime.now();
    final results = <Map<String, dynamic>>[];
    
    for (int i = 6; i >= 0; i--) {
      final date = now.subtract(Duration(days: i));
      final summary = await getDailySummary(date);
      results.add(summary);
    }
    
    return results;
  }

  /// Get monthly sales report
  Future<Map<String, dynamic>> getMonthlyReport(int year, int month) async {
    final transactions = await _db.getAllTransactions();
    
    final monthTransactions = transactions.where((t) {
      final txnDate = DateTime.fromMillisecondsSinceEpoch(t.timestamp);
      return txnDate.year == year && txnDate.month == month;
    }).toList();

    final totalSales = monthTransactions.fold<int>(
      0, 
      (sum, t) => sum + t.amountMinor
    );

    // Group by day
    final dailyBreakdown = <int, double>{};
    for (final txn in monthTransactions) {
      final day = DateTime.fromMillisecondsSinceEpoch(txn.timestamp).day;
      dailyBreakdown[day] = (dailyBreakdown[day] ?? 0) + (txn.amountMinor / 100.0);
    }

    return {
      'year': year,
      'month': month,
      'totalTransactions': monthTransactions.length,
      'totalSales': totalSales / 100.0,
      'averageTransaction': monthTransactions.isEmpty 
          ? 0 
          : (totalSales / monthTransactions.length) / 100.0,
      'dailyBreakdown': dailyBreakdown,
    };
  }

  /// Get top selling days
  Future<List<Map<String, dynamic>>> getTopDays(int limit) async {
    final transactions = await _db.getAllTransactions();
    
    final dayMap = <String, double>{};
    for (final txn in transactions) {
      final date = DateTime.fromMillisecondsSinceEpoch(txn.timestamp);
      final key = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
      dayMap[key] = (dayMap[key] ?? 0) + (txn.amountMinor / 100.0);
    }

    final sorted = dayMap.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return sorted.take(limit).map((e) => {
      'date': e.key,
      'sales': e.value,
    }).toList();
  }

  /// Get transaction volume by hour
  Future<Map<int, int>> getHourlyDistribution() async {
    final transactions = await _db.getAllTransactions();
    
    final hourly = <int, int>{};
    for (final txn in transactions) {
      final hour = DateTime.fromMillisecondsSinceEpoch(txn.timestamp).hour;
      hourly[hour] = (hourly[hour] ?? 0) + 1;
    }
    
    return hourly;
  }

  /// Export data for CSV
  Future<List<Map<String, dynamic>>> exportTransactions(
    DateTime startDate,
    DateTime endDate,
  ) async {
    final transactions = await _db.getAllTransactions();
    
    return transactions.where((t) {
      final txnDate = DateTime.fromMillisecondsSinceEpoch(t.timestamp);
      return txnDate.isAfter(startDate) && txnDate.isBefore(endDate);
    }).map((t) => {
      'transactionId': t.localTxnId,
      'stan': t.stan,
      'amount': t.amount / 100.0,
      'currency': t.currency,
      'cardLast4': t.cardLast4,
      'status': t.syncStatus,
      'timestamp': DateTime.fromMillisecondsSinceEpoch(t.timestamp).toIso8601String(),
      'settlementCode': t.settlementCode ?? '',
    }).toList();
  }
}
