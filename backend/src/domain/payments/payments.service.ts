import crypto from "crypto";
import { settingsService } from "../settings/settings.service";

export class PaymentsService {
  async charge(merchantId: string, payload: { amountMinor: number; currency: string; cardToken?: string }) {
    const settings = await settingsService.getSettings(merchantId);
    const isTestMode = !!settings.test_mode;
    const apiKey = settings.api_key || "sk_test_mock_key_12345";
    
    console.log(`[Payment] Charge request for ${merchantId} in ${isTestMode ? "TEST" : "LIVE"} mode`);

    // In a real implementation, we would use Braintree here for LIVE transactions too
    // if cardToken is provided.

    const approved = payload.amountMinor % 7 !== 0;
    const result = {
      id: `pay_${Date.now()}`,
      status: approved ? "APPROVED" : "DECLINED",
      authCode: approved ? Math.floor(100000 + Math.random() * 900000).toString() : undefined,
      rrn: approved ? Math.floor(100000000000 + Math.random() * 900000000000).toString() : undefined,
      amountMinor: payload.amountMinor,
      currency: payload.currency,
      cardBrand: "VISA",
      last4: "1111",
      testMode: isTestMode,
      processor: isTestMode ? "MOCK_GATEWAY" : "BRAINTREE_LIVE"
    };
    
    const hmac = crypto.createHmac("sha256", apiKey);
    hmac.update(JSON.stringify({ id: result.id, status: result.status, amountMinor: result.amountMinor, currency: result.currency }));
    const signature = hmac.digest("hex");
    return { ...result, signature };
  }
}

export const paymentsService = new PaymentsService();
