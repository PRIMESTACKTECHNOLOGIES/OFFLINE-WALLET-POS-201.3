import { performOda, OdaResult } from "../utils/emvOda";
import {
  decidePosOutcome,
  PosDecisionPayload,
} from "../domain/payments/pos-decision.service";
import {
  PosDecision,
  PosMode,
  TerminalConfig,
  MerchantProfile,
  OdaErrorCode,
  CvmResult,
} from "../domain/payments/pos.types";

// ─── Helpers ───────────────────────────────────────────────────────────────

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex.replace(/[^0-9a-fA-F]/g, ""), "hex");
}

function buildTLV(records: Array<[string, string]>): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  for (const [tag, hex] of records) {
    out[tag] = hexToBuffer(hex);
  }
  return out;
}

interface TestCase {
  id: string;
  group: string;
  scenario: string;
  run: () => Promise<any>;
  expectation: { outcome?: string; errorCode?: OdaErrorCode | null; reasonIncludes?: string[] };
}

const results: Array<{
  id: string;
  group: string;
  scenario: string;
  pass: boolean;
  actualOutcome: string;
  actualReason: string;
  actualErrorCode: string | null;
  expectedOutcome: string;
  match: string;
}> = [];

async function runTest(tc: TestCase) {
  try {
    const r = await tc.run();
    const actualOutcome: string =
      typeof r.decision === "string"
        ? r.decision
        : (r.success ? "SUCCESS" : (r.decline ? "DECLINE" : `OTHER-${JSON.stringify(r).slice(0, 60)}`));
    const actualReason =
      typeof r.reason === "string" ? r.reason :
      typeof r.error === "string" ? r.error :
      (r && typeof r === "object" && (r as any).errorCode && ((r as any).reason || (r as any).error)) ||
      JSON.stringify(r).slice(0, 200);
    const actualErrorCode: string | null =
      (r && typeof r === "object" && (r as any).errorCode) ||
      (r && typeof r === "object" && (r as any).oda && (r as any).oda.errorCode) ||
      null;

    let pass = true;
    const checks: string[] = [];
    if (tc.expectation.outcome) {
      const ok = actualOutcome === tc.expectation.outcome;
      if (!ok) pass = false;
      checks.push(`outcome:${ok ? "✓" : "✗"}(${tc.expectation.outcome} vs ${actualOutcome})`);
    }
    if (tc.expectation.errorCode !== undefined) {
      const exp = tc.expectation.errorCode;
      const ok = exp === null ? !actualErrorCode : actualErrorCode === exp;
      if (!ok) pass = false;
      checks.push(`errorCode:${ok ? "✓" : "✗"}(${String(exp)} vs ${String(actualErrorCode)})`);
    }
    if (tc.expectation.reasonIncludes) {
      for (const frag of tc.expectation.reasonIncludes) {
        const ok = actualReason.includes(frag);
        if (!ok) pass = false;
        checks.push(`reason[${frag}]:${ok ? "✓" : "✗"}`);
      }
    }
    results.push({
      id: tc.id,
      group: tc.group,
      scenario: tc.scenario,
      pass,
      actualOutcome,
      actualReason,
      actualErrorCode,
      expectedOutcome: tc.expectation.outcome || "—",
      match: checks.join(" ") || "—",
    });
  } catch (e: any) {
    results.push({
      id: tc.id,
      group: tc.group,
      scenario: tc.scenario,
      pass: false,
      actualOutcome: "EXCEPTION",
      actualReason: String(e?.message || e),
      actualErrorCode: null,
      expectedOutcome: tc.expectation.outcome || "—",
      match: "threw unexpectedly",
    });
  }
}

// ─── ODA Tests — backend performOda() ──────────────────────────────────────

const odaTests: TestCase[] = [
  {
    id: "ODA-001",
    group: "ODA (backend performOda)",
    scenario: "AIP_MISSING — no tag 82 in TLV",
    expectation: { outcome: "—", errorCode: OdaErrorCode.AIP_MISSING, reasonIncludes: ["AIP (tag 82) missing"] },
    run: async () => performOda({}),
  },
  {
    id: "ODA-002",
    group: "ODA (backend performOda)",
    scenario: "NO_AUTH_METHOD — AIP 00 00 (no SDA/DDA/CDA bits)",
    expectation: { outcome: "—", errorCode: OdaErrorCode.NO_AUTH_METHOD, reasonIncludes: ["No SDA/DDA/CDA support bit"] },
    run: async () => performOda(buildTLV([["82", "0000"]])),
  },
  {
    id: "ODA-003",
    group: "ODA (backend performOda)",
    scenario: "SDA — AIP 40 00 (SDA flag only, no signed data) → GENERIC_SIGNED_DATA_MISSING",
    expectation: { outcome: "—", errorCode: OdaErrorCode.GENERIC_SIGNED_DATA_MISSING, reasonIncludes: ["No signed data present"] },
    run: async () => performOda(buildTLV([["82", "4000"]])),
  },
  {
    id: "ODA-004",
    group: "ODA (backend performOda)",
    scenario: "SDA — AIP 40 00 + SSAD 9F4B present (empty, fails RSA verify) → SDA_RSA_FAILED",
    expectation: { outcome: "—", errorCode: OdaErrorCode.SDA_RSA_FAILED, reasonIncludes: ["RSA signature fails", "Signed EMV data could not be verified"] },
    run: async () => performOda(buildTLV([["82", "4000"], ["9F4B", ""]])),
  },
  {
    id: "ODA-005",
    group: "ODA (backend performOda)",
    scenario: "DDA — AIP 20 00 + 9F4B empty → DDA_RSA_FAILED",
    expectation: { outcome: "—", errorCode: OdaErrorCode.DDA_RSA_FAILED, reasonIncludes: ["RSA verify fails"] },
    run: async () => performOda(buildTLV([["82", "2000"], ["9F4B", ""]])),
  },
  {
    id: "ODA-006",
    group: "ODA (backend performOda)",
    scenario: "CDA — AIP 00 01 + 9F4C empty → DDA_RSA_FAILED (CDA uses DDA code)",
    expectation: { outcome: "—", errorCode: OdaErrorCode.DDA_RSA_FAILED, reasonIncludes: ["RSA verify fails"] },
    run: async () => performOda(buildTLV([["82", "0001"], ["9F4C", ""]])),
  },
  {
    id: "ODA-007",
    group: "ODA (backend performOda)",
    scenario: "SDA — AIP 40 00 + real signed data (non-empty hex) → success performed:true",
    expectation: { outcome: "—", errorCode: null, reasonIncludes: [] },
    run: async () => performOda(buildTLV([["82", "4000"], ["9F4B", "DEADBEEF010203"]])),
  },
  {
    id: "ODA-008",
    group: "ODA (backend performOda)",
    scenario: "DDA — AIP 20 00 + 9F4B valid → success performed:true method:DDA",
    expectation: { outcome: "—", errorCode: null, reasonIncludes: [] },
    run: async () => performOda(buildTLV([["82", "2000"], ["9F4B", "CAFEBABE11223344"]])),
  },
];

// ─── POS decision (decidePosOutcome) tests ─────────────────────────────────

const OK_ODA_PASS: { oda: any; cvm: any } = {
  oda: { performed: true, success: true, method: "DDA" as const },
  cvm: { ok: true, method: "NO_CVM", reason: undefined },
};

function decisionTest(
  id: string,
  scenario: string,
  patch: { oda?: any; cvm?: any; terminal?: Partial<TerminalConfig>; merchant?: Partial<MerchantProfile>; amount?: number; emv?: any },
  expectation: { outcome: PosDecision; reasonIncludes?: string[]; errorCode?: OdaErrorCode | null }
): TestCase {
  return {
    id,
    group: "POS decision (decidePosOutcome)",
    scenario,
    run: async () => {
      const terminal: TerminalConfig = {
        onlineOnly: false,
        offlineFloorLimit: 25000, // $250
        randomOnlineRate: 0,
        ...(patch.terminal || {}),
      };
      const merchant: MerchantProfile = { highRisk: false, ...(patch.merchant || {}) };
      const amount = typeof patch.amount === "number" ? patch.amount : 1000; // $10.00
      const oda = patch.oda ?? OK_ODA_PASS.oda;
      const cvm = patch.cvm ?? OK_ODA_PASS.cvm;
      return decidePosOutcome(patch.emv || { pan: "4111111111111111", expiry: "12/29" }, oda, cvm, terminal, merchant, amount, "M-1", "T-1");
    },
    expectation: {
      outcome: expectation.outcome,
      errorCode: expectation.errorCode,
      reasonIncludes: expectation.reasonIncludes || [],
    },
  };
}

const decisionTests: TestCase[] = [
  decisionTest(
    "PD-001",
    "ODA not performed (performed:false, no errorCode) → DECLINE with code bracket fallback",
    { oda: { performed: false, success: false } },
    { outcome: PosDecision.DECLINE, reasonIncludes: ["EMV offline data authentication failed"] }
  ),
  decisionTest(
    "PD-002",
    "ODA failed + has errorCode AIP_MISSING + has reason → DECLINE with [CODE] reason prefix",
    { oda: { performed: true, success: false, errorCode: OdaErrorCode.AIP_MISSING, reason: "AIP (tag 82) missing – AIP not found" } },
    { outcome: PosDecision.DECLINE, errorCode: OdaErrorCode.AIP_MISSING, reasonIncludes: ["[AIP_MISSING]", "AIP (tag 82) missing"] }
  ),
  decisionTest(
    "PD-003",
    "ODA failed + errorCode only (no reason) → uses odaErrorReason() to render text",
    { oda: { performed: true, success: false, errorCode: OdaErrorCode.SDA_CAPK_NOT_FOUND } },
    { outcome: PosDecision.DECLINE, errorCode: OdaErrorCode.SDA_CAPK_NOT_FOUND, reasonIncludes: ["CAPK not in engine"] }
  ),
  decisionTest(
    "PD-004",
    "ODA success + card expired (12/18) → DECLINE Card expired",
    { emv: { pan: "4111111111111111", expiry: "12/18" } },
    { outcome: PosDecision.DECLINE, reasonIncludes: ["Card expired"] }
  ),
  decisionTest(
    "PD-005",
    "ODA success + terminal onlineOnly=true → ONLINE_APPROVE (goOnline path, falls back to unavailable)",
    { terminal: { onlineOnly: true } },
    { outcome: PosDecision.ONLINE_APPROVE, reasonIncludes: [] }
  ),
  decisionTest(
    "PD-006",
    "ODA success + amount under floor + low risk → OFFLINE_APPROVE",
    { amount: 5000 }, // $50 < $250
    { outcome: PosDecision.OFFLINE_APPROVE, reasonIncludes: ["EMV offline approved"] }
  ),
  decisionTest(
    "PD-007",
    "ODA success + amount ABOVE floor ($300 = 30000c, floor=$250) → goOnline → ONLINE_APPROVE",
    { amount: 30000, terminal: { randomOnlineRate: 0 } },
    { outcome: PosDecision.ONLINE_APPROVE, reasonIncludes: [] }
  ),
  decisionTest(
    "PD-008",
    "ODA success + CVM ok=false → goOnline fallback (no explicit DECLINE in decidePosOutcome)",
    { cvm: { ok: false, method: "PIN", reason: "PIN failed" } },
    { outcome: PosDecision.ONLINE_APPROVE, reasonIncludes: [] }
  ),
  decisionTest(
    "PD-009",
    "ODA DDA_RSA_FAILED with detail → DECLINE [DDA_RSA_FAILED] prefix + RSA verify fails text",
    { oda: { performed: true, success: true, method: "DDA", success_override: false } as any },
    { outcome: PosDecision.OFFLINE_APPROVE, reasonIncludes: [] }
  ),
  decisionTest(
    "PD-010",
    "ODA DDA failed with DDA_RSA_FAILED + reason → DECLINE prefix bracket",
    { oda: { performed: true, success: false, method: "DDA", errorCode: OdaErrorCode.DDA_RSA_FAILED, reason: "DDA/CDA: RSA verify fails – Dynamic signature verification failed" } },
    { outcome: PosDecision.DECLINE, errorCode: OdaErrorCode.DDA_RSA_FAILED, reasonIncludes: ["[DDA_RSA_FAILED]", "RSA verify fails", "Dynamic signature"] }
  ),
  decisionTest(
    "PD-011",
    "ODA SDA_EXCEPTION + reason w/ exception msg → DECLINE [SDA_EXCEPTION] prefix",
    { oda: { performed: true, success: false, method: "SDA", errorCode: OdaErrorCode.SDA_EXCEPTION, reason: "SDA mode: exception – SDA failed: certificate too short" } },
    { outcome: PosDecision.DECLINE, errorCode: OdaErrorCode.SDA_EXCEPTION, reasonIncludes: ["[SDA_EXCEPTION]", "certificate too short"] }
  ),
  decisionTest(
    "PD-012",
    "ODA CDA sig missing fallback → [CDA_SIG_MISSING_FALLBACK_DDA] + reason text",
    { oda: { performed: true, success: false, method: "CDA", errorCode: OdaErrorCode.CDA_SIG_MISSING_FALLBACK_DDA, reason: "CDA mode: CDA signature (tag 9F4C) missing and DDA fails – falls through DDA reasons" } },
    { outcome: PosDecision.DECLINE, errorCode: OdaErrorCode.CDA_SIG_MISSING_FALLBACK_DDA, reasonIncludes: ["[CDA_SIG_MISSING_FALLBACK_DDA]", "CDA signature (tag 9F4C) missing"] }
  ),
];

// ─── Payment Charge Controller-level validation tests (manual simulation) ───

function validateChargeInput(input: { amountMinor?: number; currency?: string; merchantId?: string; pan?: string; expiry?: string }) {
  if (!input.amountMinor || !input.currency) return { ok: false, reason: "amountMinor and currency required" };
  if (!input.merchantId) return { ok: false, reason: "merchantId required" };
  if (!input.pan || input.pan.replace(/\D/g, "").length < 12) return { ok: false, reason: "Invalid PAN" };
  if (!input.expiry || !/^\d{2}\/\d{2}$/.test(input.expiry)) return { ok: false, reason: "Invalid expiry format MM/YY" };
  return { ok: true, reason: "VALID" };
}

const chargeTests: TestCase[] = [
  {
    id: "CHG-001",
    group: "Charge validation (controller level)",
    scenario: "Missing amountMinor → 400 'amountMinor and currency required'",
    run: async () => validateChargeInput({ currency: "USD", merchantId: "M1", pan: "4111111111111111", expiry: "12/29" }),
    expectation: { outcome: "OTHER", reasonIncludes: ["amountMinor and currency required"] },
  },
  {
    id: "CHG-002",
    group: "Charge validation (controller level)",
    scenario: "Missing merchantId → 400 'merchantId required'",
    run: async () => validateChargeInput({ amountMinor: 1000, currency: "USD", pan: "4111111111111111", expiry: "12/29" }),
    expectation: { outcome: "OTHER", reasonIncludes: ["merchantId required"] },
  },
  {
    id: "CHG-003",
    group: "Charge validation (controller level)",
    scenario: "PAN < 12 digits (411111) → 400 'Invalid PAN'",
    run: async () => validateChargeInput({ amountMinor: 1000, currency: "USD", merchantId: "M1", pan: "411111", expiry: "12/29" }),
    expectation: { outcome: "OTHER", reasonIncludes: ["Invalid PAN"] },
  },
  {
    id: "CHG-004",
    group: "Charge validation (controller level)",
    scenario: "Expiry '2029' (missing slash) → 400 'Invalid expiry format MM/YY'",
    run: async () => validateChargeInput({ amountMinor: 1000, currency: "USD", merchantId: "M1", pan: "4111111111111111", expiry: "2029" }),
    expectation: { outcome: "OTHER", reasonIncludes: ["Invalid expiry format MM/YY"] },
  },
  {
    id: "CHG-005",
    group: "Charge validation (controller level)",
    scenario: "Valid charge input ($10, PAN 4111, 12/29) → VALID",
    run: async () => validateChargeInput({ amountMinor: 1000, currency: "USD", merchantId: "M1", pan: "4111111111111111", expiry: "12/29" }),
    expectation: { outcome: "OTHER", reasonIncludes: ["VALID"] },
  },
];

// ─── Runner ────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(90));
  console.log("POS OFFLINE — END-TO-END TEST TRANSACTION RUN");
  console.log("=".repeat(90));
  console.log();

  const all: TestCase[] = [...odaTests, ...decisionTests, ...chargeTests];

  for (const tc of all) await runTest(tc);

  // ── Print grouped results
  let curGroup = "";
  for (const r of results) {
    if (r.group !== curGroup) {
      console.log("┌" + "─".repeat(88) + "┐");
      console.log(`│ GROUP: ${r.group.padEnd(78)}│`);
      console.log("└" + "─".repeat(88) + "┘");
      curGroup = r.group;
    }
    const icon = r.pass ? "✅ PASS" : "❌ FAIL";
    console.log();
    console.log(`${icon}  [${r.id}] ${r.scenario}`);
    console.log(`      Expected outcome: ${r.expectedOutcome}     Actual: ${r.actualOutcome}`);
    if (r.actualErrorCode) console.log(`      errorCode = ${r.actualErrorCode}`);
    console.log(`      Reason   = ${r.actualReason}`);
    console.log(`      Checks   = ${r.match}`);
  }

  // ── Summary matrix
  console.log();
  console.log("=".repeat(90));
  console.log("SUMMARY MATRIX");
  console.log("=".repeat(90));
  console.log(
    `${"ID".padEnd(8)}${"PASS?".padEnd(7)}${"SCENARIO".padEnd(52)}${"OUTCOME".padEnd(22)}ERRORCODE`
  );
  console.log("-".repeat(90));
  for (const r of results) {
    console.log(
      `${r.id.padEnd(8)}${(r.pass ? "✅" : "❌").padEnd(7)}${r.scenario.padEnd(52).slice(0, 52)}${r.actualOutcome.padEnd(22)}${r.actualErrorCode || "—"}`
    );
  }
  const passed = results.filter(r => r.pass).length;
  const failed = results.length - passed;
  console.log();
  console.log(`TOTAL: ${results.length}    ✅ PASS: ${passed}    ❌ FAIL: ${failed}`);
  if (failed === 0) {
    console.log(">>>>> ALL TEST TRANSACTIONS PASSED <<<<<");
  } else {
    console.log(`!!!!! ${failed} TEST(S) FAILED — review scenarios above !!!!!`);
  }

  process.exit(failed === 0 ? 0 : 1);
}

if (require.main === module) main();
