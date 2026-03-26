// Domain Models - Raw Card Data Version

class CardData {
  final String cardNumber;
  final int expiryMonth;
  final int expiryYear;
  final String? cardholderName;
  final String cvv;

  CardData({
    required this.cardNumber,
    required this.expiryMonth,
    required this.expiryYear,
    this.cardholderName,
    required this.cvv,
  });
}

class EncryptedCardData {
  final int? id;
  final String cardNumberEncrypted;
  final int expiryMonth;
  final int expiryYear;
  final String? cardholderName;
  final String cvvEncrypted;
  final String recordKeyEncrypted;
  final DateTime createdAt;
  final DateTime updatedAt;

  EncryptedCardData({
    this.id,
    required this.cardNumberEncrypted,
    required this.expiryMonth,
    required this.expiryYear,
    this.cardholderName,
    required this.cvvEncrypted,
    required this.recordKeyEncrypted,
    required this.createdAt,
    required this.updatedAt,
  });
}
