import 'package:flutter/material.dart';
import '../../domain/services/sync_service.dart';
import '../../data/repositories/sqlite_card_repository.dart';
import '../../data/repositories/sqlite_transaction_repository.dart';
import '../../data/services/aes_crypto.dart';
import '../../data/services/http_gateway.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  bool _syncing = false;
  Map<String, int> _stats = {'pending': 0, 'success': 0, 'failed': 0};
  late final SyncService _syncService;

  @override
  void initState() {
    super.initState();
    _syncService = SyncService(
      txnRepo: SqliteTransactionRepository(),
      cardRepo: SqliteCardRepository(),
      crypto: AesCryptoService(),
      gateway: HttpGatewayClient(),
    );
    _loadStats();
  }

  Future<void> _loadStats() async {
    // TODO: Implement stats query in repository
    setState(() {});
  }

  Future<void> _syncNow() async {
    setState(() => _syncing = true);

    try {
      await _syncService.syncPendingTransactions(20);
      await _loadStats();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Sync completed'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Sync error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() => _syncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sync Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadStats,
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildStatusCard(
              title: 'Pending',
              count: _stats['pending'] ?? 0,
              color: Colors.orange,
              icon: Icons.pending,
            ),
            const SizedBox(height: 12),
            _buildStatusCard(
              title: 'Synced',
              count: _stats['success'] ?? 0,
              color: Colors.green,
              icon: Icons.check_circle,
            ),
            const SizedBox(height: 12),
            _buildStatusCard(
              title: 'Failed',
              count: _stats['failed'] ?? 0,
              color: Colors.red,
              icon: Icons.error,
            ),
            const SizedBox(height: 32),
            ElevatedButton.icon(
              onPressed: _syncing ? null : _syncNow,
              icon: _syncing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
              label: Text(_syncing ? 'Syncing...' : 'Sync Now'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.pushReplacementNamed(context, '/payment'),
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildStatusCard({
    required String title,
    required int count,
    required Color color,
    required IconData icon,
  }) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withOpacity(0.2),
          child: Icon(icon, color: color),
        ),
        title: Text(title),
        trailing: Text(
          count.toString(),
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
      ),
    );
  }
}
