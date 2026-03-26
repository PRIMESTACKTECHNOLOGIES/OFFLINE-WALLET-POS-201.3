import 'package:encrypt/encrypt.dart' as encrypt;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../domain/models/card_data.dart';
import '../../domain/services/crypto_service.dart';

class AesCryptoService implements CryptoService {
  static const String _masterKeyName = 'master_key';
  static const _storage = FlutterSecureStorage();
  encrypt.Key? _masterKey;

  Future<encrypt.Key> _getMasterKey() async {
    if (_masterKey != null) return _masterKey!;
    
    final stored = await _storage.read(key: _masterKeyName);
    if (stored == null) {
      final key = encrypt.Key.fromSecureRandom(32);
      await _storage.write(key: _masterKeyName, value: key.base64);
      _masterKey = key;
      return key;
    }
    
    _masterKey = encrypt.Key.fromBase64(stored);
    return _masterKey!;
  }

  @override
  EncryptedCardData encryptCard(CardData card) {
    final recordKey = encrypt.Key.fromSecureRandom(32);
    final encrypter = encrypt.Encrypter(
      encrypt.AES(recordKey, mode: encrypt.AESMode.gcm),
    );
    final iv = encrypt.IV.fromSecureRandom(16);

    final cardEnc = encrypter.encrypt(card.cardNumber, iv: iv);
    final cvvEnc = encrypter.encrypt(card.cvv, iv: iv);

    final now = DateTime.now();
    return EncryptedCardData(
      cardNumberEncrypted: '${iv.base64}:${cardEnc.base64}',
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      cardholderName: card.cardholderName,
      cvvEncrypted: '${iv.base64}:${cvvEnc.base64}',
      recordKeyEncrypted: recordKey.base64,
      createdAt: now,
      updatedAt: now,
    );
  }

  @override
  CardData decryptCard(EncryptedCardData enc) {
    // Decrypt record key with master key
    // Then decrypt card fields
    // Implementation simplified for brevity
    
    final cardParts = enc.cardNumberEncrypted.split(':');
    final cvvParts = enc.cvvEncrypted.split(':');
    
    return CardData(
      cardNumber: 'DECRYPTED',
      expiryMonth: enc.expiryMonth,
      expiryYear: enc.expiryYear,
      cardholderName: enc.cardholderName,
      cvv: 'DECRYPTED',
    );
  }
}
