import axios from 'axios';
import fs from 'fs';
import path from 'path';

export interface BankPayoutRequest {
  merchantId: string;
  payoutId: string;
  amount: number;
  currency?: string;
  bankAccount: any;
  reference?: string;
}

export interface BankPayoutResult {
  success: boolean;
  provider: string;
  providerReference?: string;
  status: string;
  raw?: any;
}

export interface WiseDiagnostics {
  profileId: string;
  profile?: any;
  balances: Array<{
    balanceId?: string;
    currency: string;
    amount: { value: number; currency: string };
    reservedAmount?: { value: number; currency: string };
    cashAmount?: { value: number; currency: string };
  }>;
  autoSavedProfileId: boolean;
  warnings: string[];
}

function wiseHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * Persist a resolved Wise profile ID back to the .env file so operators
 * don't have to manually run GET /v1/profiles and paste the numeric value.
 * Silent no-op if .env is not writable (immutable container / read-only fs).
 */
function trySaveWiseProfileIdToEnv(profileId: string): boolean {
  try {
    const envFile = path.resolve(__dirname, "../../../../.env");
    if (!fs.existsSync(envFile)) return false;
    let content = fs.readFileSync(envFile, "utf8");
    const lineMatch = /^WISE_PROFILE_ID\s*=\s*(.*)$/m.exec(content);
    if (lineMatch && lineMatch[1] === profileId) return true;
    if (lineMatch) {
      content = content.replace(
        /^WISE_PROFILE_ID\s*=.*$/m,
        `WISE_PROFILE_ID=${profileId}`
      );
    } else {
      content = content.replace(
        /^WISE_API_KEY\s*=.*$/m,
        (m0) => `${m0}\nWISE_PROFILE_ID=${profileId}`
      );
    }
    fs.writeFileSync(envFile, content, "utf8");
    process.env.WISE_PROFILE_ID = profileId;
    return true;
  } catch {
    return false;
  }
}

async function getWiseProfileId(
  baseUrl: string,
  apiKey: string,
  explicitId?: string,
  options?: { persist?: boolean }
): Promise<string> {
  if (explicitId && explicitId.trim()) return explicitId.trim();
  const res = await axios.get(`${baseUrl}/v1/profiles`, {
    headers: wiseHeaders(apiKey),
    timeout: 10000,
  });
  const profiles: any[] = Array.isArray(res.data) ? res.data : [];
  const business = profiles.find(p => p.type === 'business');
  const chosen = business || profiles[0];
  if (!chosen?.id) throw new Error('Wise profile not found. Set WISE_PROFILE_ID explicitly.');
  const resolved = String(chosen.id);
  if (options?.persist !== false) {
    trySaveWiseProfileIdToEnv(resolved);
  }
  return resolved;
}

function buildWiseRecipientPayload(currency: string, bankAccount: any, accountHolderName: string, profileId: string) {
  const cur = (currency || 'USD').toUpperCase();

  const details: any = {};
  let legalType = 'PRIVATE';
  if (bankAccount?.business_name || bankAccount?.businessName) {
    legalType = 'BUSINESS';
    details.business = bankAccount?.business_name || bankAccount?.businessName;
  }

  if (cur === 'USD') {
    details.routingNumber = String(bankAccount?.routing_number || bankAccount?.routingNumber || '').replace(/\D/g, '');
    details.accountNumber = String(bankAccount?.account_number || bankAccount?.accountNumber || '').replace(/\D/g, '');
    details.accountType = bankAccount?.account_type || bankAccount?.accountType || 'CHECKING';
    if (!details.routingNumber || details.routingNumber.length < 9) {
      throw new Error('Wise USD ACH requires a valid 9-digit routingNumber (ABA).');
    }
    if (!details.accountNumber || details.accountNumber.length < 4) {
      throw new Error('Wise USD ACH requires a valid accountNumber.');
    }
    return {
      profile: Number(profileId),
      accountHolderName,
      currency: 'USD',
      type: 'aba',
      details,
    };
  }

  if (cur === 'EUR') {
    details.iban = String(bankAccount?.iban || '').replace(/\s+/g, '').toUpperCase();
    if (!details.iban || details.iban.length < 15) {
      throw new Error('Wise EUR SEPA requires a valid IBAN.');
    }
    return {
      profile: Number(profileId),
      accountHolderName,
      currency: 'EUR',
      type: 'iban',
      details,
      legalType,
    };
  }

  if (cur === 'GBP') {
    details.sortCode = String(bankAccount?.sort_code || bankAccount?.sortCode || '').replace(/\D/g, '');
    details.accountNumber = String(bankAccount?.account_number || bankAccount?.accountNumber || '').replace(/\D/g, '');
    if (details.sortCode.length !== 6 || details.accountNumber.length < 6) {
      throw new Error('Wise GBP requires sortCode (6 digits) and accountNumber.');
    }
    return {
      profile: Number(profileId),
      accountHolderName,
      currency: 'GBP',
      type: 'sort_code',
      details,
      legalType,
    };
  }

  // Fallback: SWIFT / wire via IBAN + BIC or account + swift
  const iban = String(bankAccount?.iban || '').replace(/\s+/g, '').toUpperCase();
  const swift = String(bankAccount?.swift_code || bankAccount?.swiftCode || bankAccount?.bic || bankAccount?.swift || '').toUpperCase().trim();
  if (iban && swift) {
    return {
      profile: Number(profileId),
      accountHolderName,
      currency: cur,
      type: 'swift',
      legalType,
      details: {
        iban,
        swiftCode: swift,
      },
    };
  }

  if (swift) {
    return {
      profile: Number(profileId),
      accountHolderName,
      currency: cur,
      type: 'swift',
      legalType,
      details: {
        accountNumber: String(bankAccount?.account_number || bankAccount?.accountNumber || ''),
        swiftCode: swift,
        bankName: bankAccount?.bank_name || bankAccount?.bankName || '',
      },
    };
  }

  throw new Error(`Wise recipient for currency ${cur} requires IBAN+BIC, or USD:ABA+account, EUR:IBAN, GBP:sortCode+account.`);
}

async function submitWisePayout(request: BankPayoutRequest): Promise<BankPayoutResult> {
  const baseUrl = process.env.WISE_API_URL?.trim() || 'https://api.transferwise.com';
  const apiKey = process.env.WISE_API_KEY?.trim() || process.env.BANK_PAYOUT_API_KEY?.trim();
  const explicitProfileId = process.env.WISE_PROFILE_ID?.trim();

  if (!apiKey) throw new Error('WISE_API_KEY or BANK_PAYOUT_API_KEY is required.');

  const currency = (request.currency || 'USD').toUpperCase();
  const amount = Number(request.amount);
  if (!amount || amount <= 0) throw new Error('Invalid payout amount.');

  const accountHolderName =
    String(request.bankAccount?.account_holder || request.bankAccount?.accountHolder || '').trim() ||
    `Merchant ${request.merchantId}`;

  const profileId = await getWiseProfileId(baseUrl, apiKey, explicitProfileId);
  const recipientPayload = buildWiseRecipientPayload(currency, request.bankAccount, accountHolderName, profileId);

  // ── 1. Create / fetch recipient account ───────────────────────────────────
  let recipient: any;
  try {
    const r = await axios.post(`${baseUrl}/v1/accounts`, recipientPayload, {
      headers: wiseHeaders(apiKey),
      timeout: 15000,
    });
    recipient = r.data;
  } catch (err: any) {
    const conflict = err?.response?.data?.errors?.find((e: any) => e.code === 'RECIPIENT_ACCOUNT_ALREADY_EXISTS');
    if (conflict) {
      recipient = { id: conflict.metadata?.recipientAccountId };
    } else {
      throw new Error(`Wise recipient creation failed: ${err?.response?.data?.errors?.[0]?.message || err.message}`);
    }
  }
  if (!recipient?.id) throw new Error('Wise recipient ID missing after creation.');

  // ── 2. Create quote (targetAmount payout) ─────────────────────────────────
  const quotePayload = {
    profile: Number(profileId),
    sourceCurrency: currency,
    targetCurrency: currency,
    targetAmount: amount,
    rateType: 'FIXED',
    type: 'BALANCE_PAYOUT',
  };
  let quote: any;
  try {
    const q = await axios.post(`${baseUrl}/v2/quotes`, quotePayload, {
      headers: wiseHeaders(apiKey),
      timeout: 15000,
    });
    quote = q.data;
  } catch (err: any) {
    throw new Error(`Wise quote creation failed: ${err?.response?.data?.errors?.[0]?.message || err.message}`);
  }
  if (!quote?.id) throw new Error('Wise quote ID missing.');

  // ── 3. Create transfer ────────────────────────────────────────────────────
  const transferPayload = {
    targetAccount: Number(recipient.id),
    quoteUuid: String(quote.id),
    customerTransactionId: request.payoutId,
    details: {
      reference: (request.reference || request.payoutId).slice(0, 35),
    },
  };
  let transfer: any;
  try {
    const t = await axios.post(`${baseUrl}/v1/transfers`, transferPayload, {
      headers: wiseHeaders(apiKey),
      timeout: 15000,
    });
    transfer = t.data;
  } catch (err: any) {
    const dup = err?.response?.data?.errors?.find((e: any) => e.code === 'DUPLICATE_CUSTOMER_TRANSACTION_ID');
    if (dup) {
      const existing = await axios.get(
        `${baseUrl}/v1/transfers?profile=${profileId}&customerTransactionId=${request.payoutId}`,
        { headers: wiseHeaders(apiKey), timeout: 10000 }
      );
      transfer = Array.isArray(existing.data) ? existing.data[0] : existing.data;
    } else {
      throw new Error(`Wise transfer creation failed: ${err?.response?.data?.errors?.[0]?.message || err.message}`);
    }
  }
  const transferId = transfer?.id;
  if (!transferId) throw new Error('Wise transfer ID missing.');

  // ── 4. Fund transfer from Wise balance ────────────────────────────────────
  let funding: any = null;
  try {
    const f = await axios.post(
      `${baseUrl}/v3/profiles/${profileId}/transfers/${transferId}/payments`,
      { type: 'BALANCE' },
      { headers: wiseHeaders(apiKey), timeout: 20000 }
    );
    funding = f.data;
  } catch (err: any) {
    // If transfer already outgoing / processing, treat as submitted; let webhook update final state.
    const code = err?.response?.data?.errors?.[0]?.code;
    if (!['TRANSFER_ALREADY_FUNDED', 'BAD_STATE', 'ILLEGAL_STATE_TRANSITION'].includes(code)) {
      throw new Error(`Wise transfer funding failed: ${err?.response?.data?.errors?.[0]?.message || err.message}`);
    }
  }

  const finalStatus =
    String(funding?.status || transfer?.status || 'submitted').toUpperCase();

  return {
    success: true,
    provider: 'wise',
    providerReference: String(transferId),
    status: finalStatus,
    raw: {
      recipientId: recipient.id,
      quoteId: quote.id,
      transferId,
      profileId,
      funding: funding || { note: 'already_funded_or_processing' },
      transferStatus: transfer?.status,
    },
  };
}

async function submitExternalPayout(request: BankPayoutRequest): Promise<BankPayoutResult> {
  const apiUrl = process.env.BANK_PAYOUT_API_URL?.trim();
  const apiKey = process.env.BANK_PAYOUT_API_KEY?.trim() || process.env.WISE_API_KEY?.trim();

  if (!apiUrl) throw new Error('BANK_PAYOUT_API_URL is required for external live payouts.');
  if (!apiKey) throw new Error('BANK_PAYOUT_API_KEY or WISE_API_KEY is required for external live payouts.');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  headers.Authorization = `Bearer ${apiKey}`;

  const payload = {
    provider: (process.env.BANK_PAYOUT_PROVIDER || 'external').trim().toLowerCase(),
    merchant_id: request.merchantId,
    payout_id: request.payoutId,
    amount: Number(request.amount),
    currency: request.currency || 'USD',
    reference: request.reference || request.payoutId,
    recipient: {
      bank_name: request.bankAccount?.bank_name || request.bankAccount?.bankName || null,
      account_holder: request.bankAccount?.account_holder || request.bankAccount?.accountHolder || null,
      account_number: request.bankAccount?.account_number || request.bankAccount?.accountNumber || null,
      routing_number: request.bankAccount?.routing_number || request.bankAccount?.routingNumber || null,
      iban: request.bankAccount?.iban || null,
      swift_code: request.bankAccount?.swiftCode || request.bankAccount?.swift_code || null,
    },
  };

  const response = await axios.post(apiUrl, payload, {
    headers,
    timeout: 20000,
  });

  const providerReference =
    response.data?.id ||
    response.data?.transfer_id ||
    response.data?.payment_id ||
    response.data?.reference ||
    response.data?.data?.id;
  const status = String(
    response.data?.status || response.data?.state || response.data?.transfer_state || 'submitted'
  );

  return {
    success: true,
    provider: payload.provider,
    providerReference,
    status,
    raw: response.data,
  };
}

/**
 * Diagnostics / preflight for the native Wise provider.
 * Resolves the profile ID (auto-saving it to the env file), fetches all
 * balance holdings (amount available per currency), and returns operational
 * warnings (e.g. zero-balance in USD, or an empty profile type).
 *
 * Used by:
 *   - GET /api/payout/bank/wise/diagnostics  (Developer dashboard)
 *   - Bank payout preflight  (Wise provider only)
 */
export async function getWiseDiagnostics(): Promise<WiseDiagnostics> {
  const baseUrl = process.env.WISE_API_URL?.trim() || 'https://api.transferwise.com';
  const apiKey = process.env.WISE_API_KEY?.trim() || process.env.BANK_PAYOUT_API_KEY?.trim();
  const explicitProfileId = process.env.WISE_PROFILE_ID?.trim();

  if (!apiKey) {
    throw new Error('WISE_API_KEY (or BANK_PAYOUT_API_KEY) is not configured.');
  }

  const warnings: string[] = [];
  let autoSaved = false;

  const before = explicitProfileId;
  const profileId = await getWiseProfileId(baseUrl, apiKey, explicitProfileId, { persist: true });
  if (!before) autoSaved = true;

  // ── Fetch profile details ───────────────────────────────────────────────
  let profile: any = null;
  try {
    const res = await axios.get(`${baseUrl}/v1/profiles/${profileId}`, {
      headers: wiseHeaders(apiKey),
      timeout: 10000,
    });
    profile = res.data;
    if (profile?.type && profile.type === 'personal') {
      warnings.push(
        'Wise profile is PERSONAL. Business payouts require a BUSINESS profile. Expect ACH/SEPA rejection on wires > $15k.'
      );
    }
  } catch (e: any) {
    warnings.push(
      `Wise profile fetch failed (continuing): ${e?.response?.data?.errors?.[0]?.message || e.message}`
    );
  }

  // ── Fetch balances ──────────────────────────────────────────────────────
  // Wise v4 endpoint: GET /v4/profiles/{id}/balances?types=STANDARD
  // (the /v3 endpoint still works as of mid-2025; we try both defensively)
  let balances: WiseDiagnostics['balances'] = [];
  for (const ep of [
    `${baseUrl}/v4/profiles/${profileId}/balances?types=STANDARD,SAVINGS`,
    `${baseUrl}/v3/profiles/${profileId}/balances`,
    `${baseUrl}/borderless-accounts?profileId=${profileId}`,
  ]) {
    try {
      const res = await axios.get(ep, { headers: wiseHeaders(apiKey), timeout: 10000 });
      const list: any[] = Array.isArray(res.data) ? res.data : res.data?.balances || res.data?.accounts || [];
      balances = list
        .map((b: any) => {
          const cur = b.currency || b.balanceCurrency || '';
          const amountVal = Number(b.amount?.value ?? b.balance?.amount ?? b.primaryValue ?? 0);
          const amountCur = b.amount?.currency ?? b.balance?.currency ?? cur;
          return {
            balanceId: b.id || b.balanceId || undefined,
            currency: cur,
            amount: { value: amountVal, currency: amountCur },
            reservedAmount: b.reservedAmount
              ? { value: Number(b.reservedAmount.value || 0), currency: b.reservedAmount.currency || cur }
              : undefined,
            cashAmount: b.cashAmount
              ? { value: Number(b.cashAmount.value || 0), currency: b.cashAmount.currency || cur }
              : undefined,
          };
        })
        .filter(b => b.currency && (b.amount.value > 0 || b.amount.value === 0));
      if (balances.length > 0) break;
    } catch (e: any) {
      // try next endpoint
    }
  }
  if (balances.length === 0) {
    warnings.push(
      'Wise returned no balances. Either the profile has zero funded balances, or API key lacks the balances read scope.'
    );
  }
  const usd = balances.find(b => b.currency === 'USD');
  if (!usd || usd.amount.value <= 0) {
    warnings.push(
      'No USD balance > 0. USD payouts (most common) will fail until you add USD funds to the Wise balance at https://wise.com.'
    );
  }

  return { profileId, profile, balances, autoSavedProfileId: autoSaved, warnings };
}

export async function submitBankPayout(request: BankPayoutRequest): Promise<BankPayoutResult> {
  const provider = (process.env.BANK_PAYOUT_PROVIDER || 'external').trim().toLowerCase();

  if (provider === 'wise') {
    return submitWisePayout(request);
  }

  return submitExternalPayout(request);
}

export default { submitBankPayout, getWiseDiagnostics };

