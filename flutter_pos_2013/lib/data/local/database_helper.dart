import 'dart:async';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import '../model/transaction_model.dart';
import '../model/myfatoorah_model.dart';

/// SQLite Database Helper
class DatabaseHelper {
  static final DatabaseHelper _instance = DatabaseHelper._internal();
  factory DatabaseHelper() => _instance;
  DatabaseHelper._internal();

  static Database? _database;
  
  // Database info
  static const String _databaseName = 'pos_2013.db';
  static const int _databaseVersion = 1;

  // Table names
  static const String _tableTransactions = 'transactions';
  static const String _tableOfflineOrders = 'offline_orders';

  // Get database instance
  Future<Database> get database async {
    _database ??= await _initDatabase();
    return _database!;
  }

  // Initialize database
  Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, _databaseName);

    return await openDatabase(
      path,
      version: _databaseVersion,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
  }

  // Create tables
  Future<void> _onCreate(Database db, int version) async {
    // Transactions table
    await db.execute('''
      CREATE TABLE $_tableTransactions (
        id TEXT PRIMARY KEY,
        localTxnId TEXT NOT NULL UNIQUE,
        stan TEXT NOT NULL,
        amountMinor INTEGER NOT NULL,
        currency TEXT DEFAULT 'USD',
        encryptedPan TEXT,
        cardLast4 TEXT NOT NULL,
        cardExpiry TEXT,
        txnType TEXT DEFAULT 'SALE',
        entryMode TEXT DEFAULT 'MANUAL',
        timestamp INTEGER NOT NULL,
        txnTimestamp TEXT,
        syncStatus TEXT DEFAULT 'PENDING',
        synced INTEGER DEFAULT 0,
        settlementCode TEXT,
        errorMessage TEXT
      )
    ''');

    // Create indexes
    await db.execute('''
      CREATE INDEX idx_sync_status ON $_tableTransactions(syncStatus)
    ''');
    await db.execute('''
      CREATE INDEX idx_timestamp ON $_tableTransactions(timestamp)
    ''');

    // Offline orders table
    await db.execute('''
      CREATE TABLE $_tableOfflineOrders (
        orderId TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        customerName TEXT NOT NULL,
        customerPhone TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        createdAt INTEGER NOT NULL,
        linkSentAt INTEGER,
        invoiceId TEXT,
        paymentUrl TEXT
      )
    ''');

    await db.execute('''
      CREATE INDEX idx_order_status ON $_tableOfflineOrders(status)
    ''');
  }

  // Upgrade database
  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    // Handle migrations here
  }

  // ========== TRANSACTION OPERATIONS ==========

  /// Insert a new transaction
  Future<int> insertTransaction(TransactionModel transaction) async {
    final db = await database;
    return await db.insert(
      _tableTransactions,
      transaction.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Get all transactions
  Future<List<TransactionModel>> getAllTransactions() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      _tableTransactions,
      orderBy: 'timestamp DESC',
    );
    return maps.map((map) => TransactionModel.fromMap(map)).toList();
  }

  /// Get pending transactions
  Future<List<TransactionModel>> getPendingTransactions() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      _tableTransactions,
      where: 'syncStatus = ?',
      whereArgs: ['PENDING'],
      orderBy: 'timestamp ASC',
    );
    return maps.map((map) => TransactionModel.fromMap(map)).toList();
  }

  /// Get transactions by status
  Future<List<TransactionModel>> getTransactionsByStatus(String status) async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      _tableTransactions,
      where: 'syncStatus = ?',
      whereArgs: [status],
      orderBy: 'timestamp DESC',
    );
    return maps.map((map) => TransactionModel.fromMap(map)).toList();
  }

  /// Get transaction by local ID
  Future<TransactionModel?> getTransactionByLocalId(String localTxnId) async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      _tableTransactions,
      where: 'localTxnId = ?',
      whereArgs: [localTxnId],
      limit: 1,
    );
    if (maps.isEmpty) return null;
    return TransactionModel.fromMap(maps.first);
  }

  /// Update transaction status
  Future<int> updateTransactionStatus(
    String localTxnId, {
    required String status,
    String? settlementCode,
    String? errorMessage,
  }) async {
    final db = await database;
    final Map<String, dynamic> values = {
      'syncStatus': status,
      'synced': status == 'SYNCED' ? 1 : 0,
    };
    if (settlementCode != null) values['settlementCode'] = settlementCode;
    if (errorMessage != null) values['errorMessage'] = errorMessage;

    return await db.update(
      _tableTransactions,
      values,
      where: 'localTxnId = ?',
      whereArgs: [localTxnId],
    );
  }

  /// Mark transaction as synced
  Future<int> markAsSynced(String localTxnId, String settlementCode) async {
    return await updateTransactionStatus(
      localTxnId,
      status: 'SYNCED',
      settlementCode: settlementCode,
    );
  }

  /// Get pending count
  Future<int> getPendingCount() async {
    final db = await database;
    final result = await db.rawQuery('''
      SELECT COUNT(*) as count FROM $_tableTransactions WHERE syncStatus = 'PENDING'
    ''');
    return result.first['count'] as int? ?? 0;
  }

  /// Delete old synced transactions
  Future<int> deleteOldSyncedTransactions(int olderThanMillis) async {
    final db = await database;
    final cutoff = DateTime.now().millisecondsSinceEpoch - olderThanMillis;
    return await db.delete(
      _tableTransactions,
      where: 'syncStatus = ? AND timestamp < ?',
      whereArgs: ['SYNCED', cutoff],
    );
  }

  /// Delete all transactions
  Future<int> deleteAllTransactions() async {
    final db = await database;
    return await db.delete(_tableTransactions);
  }

  // ========== OFFLINE ORDER OPERATIONS ==========

  /// Insert offline order
  Future<int> insertOfflineOrder(OfflineOrder order) async {
    final db = await database;
    return await db.insert(
      _tableOfflineOrders,
      order.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Get all offline orders
  Future<List<OfflineOrder>> getAllOfflineOrders() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      _tableOfflineOrders,
      orderBy: 'createdAt DESC',
    );
    return maps.map((map) => OfflineOrder.fromMap(map)).toList();
  }

  /// Get pending offline orders
  Future<List<OfflineOrder>> getPendingOrders() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      _tableOfflineOrders,
      where: 'status = ?',
      whereArgs: ['PENDING'],
      orderBy: 'createdAt ASC',
    );
    return maps.map((map) => OfflineOrder.fromMap(map)).toList();
  }

  /// Get link sent orders
  Future<List<OfflineOrder>> getLinkSentOrders() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      _tableOfflineOrders,
      where: 'status = ?',
      whereArgs: ['LINK_SENT'],
      orderBy: 'linkSentAt DESC',
    );
    return maps.map((map) => OfflineOrder.fromMap(map)).toList();
  }

  /// Get paid orders
  Future<List<OfflineOrder>> getPaidOrders() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      _tableOfflineOrders,
      where: 'status = ?',
      whereArgs: ['PAID'],
      orderBy: 'createdAt DESC',
    );
    return maps.map((map) => OfflineOrder.fromMap(map)).toList();
  }

  /// Update offline order
  Future<int> updateOfflineOrder(OfflineOrder order) async {
    final db = await database;
    return await db.update(
      _tableOfflineOrders,
      order.toMap(),
      where: 'orderId = ?',
      whereArgs: [order.orderId],
    );
  }

  /// Get pending count
  Future<int> getPendingOrderCount() async {
    final db = await database;
    final result = await db.rawQuery('''
      SELECT COUNT(*) as count FROM $_tableOfflineOrders WHERE status = 'PENDING'
    ''');
    return result.first['count'] as int? ?? 0;
  }

  /// Get link sent count
  Future<int> getLinkSentOrderCount() async {
    final db = await database;
    final result = await db.rawQuery('''
      SELECT COUNT(*) as count FROM $_tableOfflineOrders WHERE status = 'LINK_SENT'
    ''');
    return result.first['count'] as int? ?? 0;
  }

  /// Delete old orders
  Future<int> deleteOldOrders(int days) async {
    final db = await database;
    final cutoff = DateTime.now().millisecondsSinceEpoch - (days * 24 * 60 * 60 * 1000);
    return await db.delete(
      _tableOfflineOrders,
      where: 'createdAt < ?',
      whereArgs: [cutoff],
    );
  }

  /// Delete all orders
  Future<int> deleteAllOrders() async {
    final db = await database;
    return await db.delete(_tableOfflineOrders);
  }

  // ========== DATABASE MANAGEMENT ==========

  /// Close database
  Future<void> close() async {
    final db = await database;
    await db.close();
    _database = null;
  }

  /// Delete entire database
  Future<void> deleteDatabase() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, _databaseName);
    await close();
    await databaseFactory.deleteDatabase(path);
  }
}
