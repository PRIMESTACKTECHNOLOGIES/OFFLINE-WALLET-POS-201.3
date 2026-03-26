import '../../domain/models/card_data.dart';
import '../../domain/repositories/card_repository.dart';
import '../database.dart';

class SqliteCardRepository implements CardRepository {
  @override
  Future<int> saveEncrypted(EncryptedCardData card) async {
    final db = await AppDatabase.instance;
    final now = DateTime.now().millisecondsSinceEpoch;
    
    return await db.insert('payment_cards', {
      'card_number_encrypted': card.cardNumberEncrypted,
      'expiry_month': card.expiryMonth,
      'expiry_year': card.expiryYear,
      'cardholder_name': card.cardholderName,
      'cvv_encrypted': card.cvvEncrypted,
      'record_key_encrypted': card.recordKeyEncrypted,
      'created_at': now,
      'updated_at': now,
    });
  }

  @override
  Future<EncryptedCardData?> getById(int id) async {
    final db = await AppDatabase.instance;
    final maps = await db.query(
      'payment_cards',
      where: 'id = ?',
      whereArgs: [id],
    );

    if (maps.isEmpty) return null;

    final m = maps.first;
    return EncryptedCardData(
      id: m['id'] as int,
      cardNumberEncrypted: m['card_number_encrypted'] as String,
      expiryMonth: m['expiry_month'] as int,
      expiryYear: m['expiry_year'] as int,
      cardholderName: m['cardholder_name'] as String?,
      cvvEncrypted: m['cvv_encrypted'] as String,
      recordKeyEncrypted: m['record_key_encrypted'] as String,
      createdAt: DateTime.fromMillisecondsSinceEpoch(m['created_at'] as int),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(m['updated_at'] as int),
    );
  }
}
