import { generateHmacSignature } from './crypto';

const BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export interface Terminal {
  id: string;
  merchantId: string;
  terminalId: string;
  name: string;
  offlineEnabled: boolean;
  lastBatchAt?: string | null;
}

export interface Transaction {
  id: string;
  merchantId: string;
  terminalId: string;
  batchId?: string;
  localTxnId?: string;
  stan?: string;
  amountMinor: number;
  currency: string;
  panMasked?: string;
  txnType?: string;
  authMode?: string;
  entryMode?: string;
  rrn?: string;
  authCode?: string;
  status: string;
  emvData?: any;
  txnTimestamp: string;
  cardBrand?: string;
  invoiceId?: string;
  paymentId?: string;
}

export interface Batch {
  id: string;
  merchantId: string;
  terminalId: string;
  status: string;
  txnCount?: number;
  totalAmountMinor?: number;
  settlementCode?: string;
  uploadTimestamp: string;
  protocolVersion?: string;
  terminalName?: string;
  transactionCount?: number;
  approvedCount?: number;
  declinedCount?: number;
  batchSeq?: number;
}

export interface Settings {
  merchant_id: string;
  api_key: string;
  webhook_url: string;
  test_mode: boolean;
  merchant_name: string;
  support_email: string;
  merchant_address?: string;
  merchant_phone?: string;
  license_number?: string;
  tax_id?: string;
  paypal_client_id: string;
  paypal_client_secret: string;
  myfatoorah_api_token?: string;
  myfatoorah_test_mode?: boolean;
  paymentConfig?: any[];
  terminal_id?: string;
}

export interface Receipt {
  receiptId: string;
  transactionId: string;
  generatedAt: string;
  stan: string;
  amount: string;
  currency: string;
  cardMasked: string;
  status: string;
  merchantInfo?: {
    name: string;
    address: string;
    id: string;
  };
  transaction?: {
    terminalId: string;
    date: string;
    settlementCode?: string;
  };
  footer?: string;
}

function getAuthHeader() {
  const token = localStorage.getItem("token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers = {
    ...options.headers,
    ...getAuthHeader(),
    "Content-Type": "application/json",
  } as HeadersInit;
  try {
    const res = await fetch(url, { ...options, headers });
    return res;
  } catch (error) {
    // Network error or other fetch issue
    return { ok: false, status: 500, json: async () => ({ error: "Network error" }) } as Response;
  }
}

export async function login(username: string, password: string) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Login failed");
  }
  return res.json();
}

export async function fetchTerminals(): Promise<Terminal[]> {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/terminals`);
  if (!res.ok) {
    throw new Error("Failed to fetch terminals");
  }
  return res.json();
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/transactions`);
  if (!res.ok) {
    throw new Error("Failed to fetch transactions");
  }
  return res.json();
}

export async function registerTerminal(name: string) {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/terminal/register`, {
    method: "POST",
    body: JSON.stringify({ terminalName: name }),
  });
  if (!res.ok) {
    throw new Error("Failed to register terminal");
  }
  return res.json();
}

export async function regenerateTerminalSecret(merchantId: string, terminalId: string) {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/terminal/regenerate-secret`, {
    method: "POST",
    body: JSON.stringify({ merchantId, terminalId }),
  });
  if (!res.ok) {
    throw new Error("Failed to regenerate terminal secret");
  }
  return res.json();
}

export async function forceTerminalReboot(merchantId: string, terminalId: string) {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/terminal/force-reboot`, {
    method: "POST",
    body: JSON.stringify({ merchantId, terminalId }),
  });
  if (!res.ok) {
    throw new Error("Failed to send reboot command");
  }
  return res.json();
}

export async function fetchSettings(): Promise<Settings> {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/settings`);
  if (!res.ok) {
    throw new Error("Failed to fetch settings");
  }
  return res.json();
}

export async function updateSettings(data: any) {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/settings`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error("Failed to update settings");
  }
  return res.json();
}

export async function fetchBatches(): Promise<Batch[]> {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/batches`);
  if (!res.ok) {
    throw new Error("Failed to fetch batches");
  }
  return res.json();
}

export async function uploadBatch(batchData: any, secret: string = "s3cr3t-key-for-T2013-0001") {
  // Generate signature
  const signature = await generateHmacSignature(
    batchData.protocolVersion,
    batchData.merchantId,
    batchData.terminalId,
    batchData.batchId,
    batchData.timestamp,
    batchData.nonce,
    batchData.transactions?.length || 1,
    secret
  );

  const payload = { ...batchData, signature };

  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/pos/201.3/offline-batch`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    console.warn("Upload Batch failed", errorData);
    throw new Error(errorData.error || "Batch upload failed");
  }

  return res.json();
}

export async function chargePayment(amountMinor: number, currency: string, merchantId: string = "MRC-1001", cardData?: { pan: string; expiry: string }) {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/payments/charge`, {
    method: "POST",
    body: JSON.stringify({ amountMinor, currency, merchantId, ...cardData })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Charge failed");
  }
  return res.json();
}

// NEW: Secure payment with HMAC signature for Protocol 201.3
export async function processSecurePayment(
  paymentData: {
    protocolVersion: string;
    merchantId: string;
    terminalId: string;
    batchId: string;
    timestamp: number;
    nonce: string;
    signature: string;
    transactions: Array<{
      localTxnId: string;
      stan: string;
      amountMinor: number;
      currency: string;
      pan: string;
      expiry: string;
      cvv?: string;
      txnType: string;
      entryMode: string;
      txnTimestamp: number;
    }>;
  }
) {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/api/payment2013/batch`, {
    method: "POST",
    headers: {
      "X-Merchant-Id": paymentData.merchantId,
      "X-Terminal-Id": paymentData.terminalId,
      "X-Signature": paymentData.signature,
    },
    body: JSON.stringify(paymentData),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Payment processing failed");
  }
  
  return res.json();
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const res = await fetchWithAuth(`${BASE_URL}/auth/change-password`, {
    method: "POST",
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to change password");
  }

  const data = await res.json();
  if (data.status === false) {
    throw new Error(data.message || "Failed to change password");
  }
  return data;
}

export async function getProfile() {
  const res = await fetchWithAuth(`${BASE_URL}/auth/profile`);
  if (!res.ok) {
     const errorData = await res.json().catch(() => ({}));
     throw new Error(errorData.error || "Failed to load profile");
  }
  return res.json();
}

export async function updateProfile(profile: any) {
  const res = await fetchWithAuth(`${BASE_URL}/auth/profile`, {
    method: "PUT",
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
     const errorData = await res.json().catch(() => ({}));
     throw new Error(errorData.error || "Failed to update profile");
  }
  return res.json();
}

export async function toggle2FA(enable: boolean) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}/auth/2fa/toggle`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ enable }),
  });
  if (!res.ok) throw new Error("Failed to toggle 2FA");
  return res.json();
}

export async function getSessions() {
  const res = await fetchWithAuth(`${BASE_URL}/auth/sessions`);
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function revokeSession(sessionId: string) {
  const res = await fetchWithAuth(`${BASE_URL}/auth/sessions/${sessionId}`, {
    method: "DELETE"
  });
  if (!res.ok) throw new Error("Failed to revoke session");
  return res.json();
}

export async function regenerateApiKey() {
  const res = await fetchWithAuth(`${BASE_URL}/auth/api-key/regenerate`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to regenerate API key");
  return res.json();
}

export interface CashoutResponse {
  synced: number;
  failed: number;
  details?: any[];
  mode?: "TEST" | "LIVE";
  message?: string;
}

export async function cashoutBraintree(batches: any[]): Promise<CashoutResponse> {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/cashout/myfatoorah`, {
    method: "POST",
    body: JSON.stringify({ batches })
  });
  if (!res.ok) {
    return { synced: 0, failed: batches.length };
  }
  return res.json();
}

// New MyFatoorah-specific cashout function
export async function cashoutMyFatoorah(batches: any[], testMode?: boolean): Promise<CashoutResponse> {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/cashout/myfatoorah`, {
    method: "POST",
    body: JSON.stringify({ batches, testMode })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    return { synced: 0, failed: batches.length, message: errorData.error || "Cashout failed" };
  }
  return res.json();
}

// Protocol 201.3 - Live Redemption
export interface RedeemRequest {
  code: string;
  amount: number;
  merchantId?: string;
}

export interface RedeemResponse {
  success: boolean;
  message: string;
  reference?: string;
  time?: string;
}

export async function redeemPaymentCode(request: RedeemRequest): Promise<RedeemResponse> {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/pos/201.3/redeem`, {
    method: "POST",
    body: JSON.stringify(request)
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || "Redemption failed");
  }
  
  return res.json();
}

// Get transaction by ID
export async function getTransactionById(id: string): Promise<Transaction | null> {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/transactions/${id}`);
  if (!res.ok) {
    return null;
  }
  return res.json();
}


// ==================== RECEIPTS API ====================

export async function fetchReceipts(): Promise<Receipt[]> {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/receipts`);
  if (!res.ok) {
    throw new Error("Failed to fetch receipts");
  }
  const data = await res.json();
  return data.receipts || [];
}

export async function generateReceipt(transactionId: string): Promise<Receipt> {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/receipts/generate/${transactionId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to generate receipt");
  }
  const data = await res.json();
  return data.receipt;
}

export async function getReceipt(receiptId: string): Promise<Receipt | null> {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/receipts/${receiptId}`);
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  return data.receipt;
}

export async function printReceipt(receiptId: string): Promise<{ receipt: Receipt; printable: string }> {
  const res = await fetchWithAuth(`${BASE_URL}/merchant/v1/receipts/${receiptId}/print`);
  if (!res.ok) {
    throw new Error("Failed to get printable receipt");
  }
  return res.json();
}
