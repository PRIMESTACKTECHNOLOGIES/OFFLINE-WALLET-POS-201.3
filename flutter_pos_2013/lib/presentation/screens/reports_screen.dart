import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/theme/app_theme.dart';
import '../../data/repository/analytics_repository.dart';
import '../widgets/charts/bar_chart_widget.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  final _analytics = AnalyticsRepository();
  final _currencyFormat = NumberFormat.currency(symbol: '\$');
  
  bool _isLoading = true;
  Map<String, dynamic>? _todaySummary;
  List<Map<String, dynamic>>? _weeklyReport;
  Map<String, dynamic>? _monthlyReport;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    
    final today = await _analytics.getDailySummary(DateTime.now());
    final weekly = await _analytics.getWeeklyReport();
    final monthly = await _analytics.getMonthlyReport(
      DateTime.now().year,
      DateTime.now().month,
    );
    
    setState(() {
      _todaySummary = today;
      _weeklyReport = weekly;
      _monthlyReport = monthly;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Reports & Analytics'),
        actions: [
          IconButton(
            icon: const Icon(Icons.file_download),
            onPressed: _exportData,
            tooltip: 'Export Data',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildTodayCard(),
                    const SizedBox(height: 16),
                    _buildWeeklyChart(),
                    const SizedBox(height: 16),
                    _buildMonthlyCard(),
                    const SizedBox(height: 16),
                    _buildQuickStats(),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildTodayCard() {
    final sales = _todaySummary?['totalSales'] ?? 0.0;
    final transactions = _todaySummary?['totalTransactions'] ?? 0;
    final successful = _todaySummary?['successful'] ?? 0;
    final pending = _todaySummary?['pending'] ?? 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              "Today's Sales",
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              _currencyFormat.format(sales),
              style: const TextStyle(
                fontSize: 36,
                fontWeight: FontWeight.bold,
                color: AppTheme.primaryColor,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildStatItem('Transactions', transactions.toString(), Icons.receipt),
                _buildStatItem('Successful', successful.toString(), Icons.check_circle, Colors.green),
                _buildStatItem('Pending', pending.toString(), Icons.schedule, Colors.orange),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWeeklyChart() {
    if (_weeklyReport == null || _weeklyReport!.isEmpty) {
      return const SizedBox.shrink();
    }

    final data = _weeklyReport!.map((r) => r['totalSales'] as double).toList();
    final labels = _weeklyReport!.map((r) {
      final date = DateTime.parse(r['date']);
      return DateFormat('EEE').format(date);
    }).toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Last 7 Days',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 200,
              child: BarChartWidget(
                data: data,
                labels: labels,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMonthlyCard() {
    final sales = _monthlyReport?['totalSales'] ?? 0.0;
    final transactions = _monthlyReport?['totalTransactions'] ?? 0;
    final avg = _monthlyReport?['averageTransaction'] ?? 0.0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'This Month',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _buildSummaryTile(
                    'Total Sales',
                    _currencyFormat.format(sales),
                    Icons.attach_money,
                    AppTheme.primaryColor,
                  ),
                ),
                Expanded(
                  child: _buildSummaryTile(
                    'Transactions',
                    transactions.toString(),
                    Icons.receipt_long,
                    AppTheme.accentColor,
                  ),
                ),
                Expanded(
                  child: _buildSummaryTile(
                    'Average',
                    _currencyFormat.format(avg),
                    Icons.trending_up,
                    Colors.purple,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickStats() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Quick Insights',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            ListTile(
              leading: const Icon(Icons.calendar_today, color: AppTheme.primaryColor),
              title: const Text('Best Day'),
              subtitle: Text(_getBestDay()),
              trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.access_time, color: Colors.orange),
              title: const Text('Peak Hours'),
              subtitle: const Text('12:00 PM - 2:00 PM'),
              trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.trending_up, color: Colors.green),
              title: const Text('Growth'),
              subtitle: const Text('+12% from last month'),
              trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatItem(String label, String value, IconData icon, [Color? color]) {
    return Column(
      children: [
        Icon(icon, color: color ?? Colors.grey),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey.shade600,
          ),
        ),
      ],
    );
  }

  Widget _buildSummaryTile(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Icon(icon, color: color),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: color,
              fontSize: 14,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              color: Colors.grey.shade600,
            ),
          ),
        ],
      ),
    );
  }

  String _getBestDay() {
    if (_weeklyReport == null || _weeklyReport!.isEmpty) return 'No data';
    
    final best = _weeklyReport!.reduce((a, b) => 
      (a['totalSales'] as double) > (b['totalSales'] as double) ? a : b);
    
    final date = DateTime.parse(best['date']);
    return DateFormat('EEEE, MMM d').format(date);
  }

  void _exportData() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Export Data'),
        content: const Text('Export all transactions to CSV?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              // TODO: Implement CSV export
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Export feature coming soon')),
              );
            },
            child: const Text('Export'),
          ),
        ],
      ),
    );
  }
}
