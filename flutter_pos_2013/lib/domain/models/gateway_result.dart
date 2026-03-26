enum GatewayResultType {
  SUCCESS,
  HARD_FAIL,
  SOFT_FAIL,
}

class GatewayChargeResult {
  final GatewayResultType type;
  final String? gatewayTxnId;
  final String? errorCode;
  final String? errorMessage;

  GatewayChargeResult({
    required this.type,
    this.gatewayTxnId,
    this.errorCode,
    this.errorMessage,
  });
}
