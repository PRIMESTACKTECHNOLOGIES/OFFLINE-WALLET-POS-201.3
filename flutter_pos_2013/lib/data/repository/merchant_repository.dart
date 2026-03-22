import '../../core/config/gateway_config.dart';
import '../model/auth_model.dart';

/// Multi-Merchant Repository
/// Supports switching between multiple merchant accounts
class MerchantRepository {
  static final List<TerminalInfo> _merchants = [];
  static TerminalInfo? _currentMerchant;

  /// Initialize with saved merchants
  static Future<void> initialize() async {
    // Load from secure storage if needed
    final isRegistered = await GatewayConfig.isDeviceRegistered;
    if (isRegistered) {
      final merchantId = await GatewayConfig.merchantId;
      final terminalId = await GatewayConfig.terminalId;
      final serverUrl = await GatewayConfig.serverUrl;
      
      final merchant = TerminalInfo(
        merchantId: merchantId,
        terminalId: terminalId,
        serverUrl: serverUrl,
        isRegistered: true,
      );
      
      _merchants.add(merchant);
      _currentMerchant = merchant;
    }
  }

  /// Add new merchant
  static Future<void> addMerchant(TerminalInfo merchant) async {
    _merchants.add(merchant);
  }

  /// Remove merchant
  static Future<void> removeMerchant(String merchantId) async {
    _merchants.removeWhere((m) => m.merchantId == merchantId);
  }

  /// Switch to merchant
  static Future<void> switchMerchant(String merchantId) async {
    final merchant = _merchants.firstWhere(
      (m) => m.merchantId == merchantId,
      orElse: () => throw Exception('Merchant not found'),
    );
    
    await GatewayConfig.setMerchantId(merchant.merchantId);
    await GatewayConfig.setTerminalId(merchant.terminalId);
    await GatewayConfig.setServerUrl(merchant.serverUrl);
    
    _currentMerchant = merchant;
  }

  /// Get all merchants
  static List<TerminalInfo> getMerchants() => List.unmodifiable(_merchants);

  /// Get current merchant
  static TerminalInfo? getCurrentMerchant() => _currentMerchant;

  /// Check if multi-merchant is enabled
  static bool get isMultiMerchant => _merchants.length > 1;
}
