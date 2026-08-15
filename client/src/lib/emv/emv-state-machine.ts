/**
 * EMV L2 State Machine Controller
 *
 * Orchestrates the complete EMV Level 2 transaction flow as a state machine:
 *
 *   INIT → SELECT/GPO/READ RECORD → ODA → TERMINAL RISK → CARD RISK →
 *   CVM → DECISION → AC GENERATION → [ONLINE] → [ISSUER SCRIPTS] → COMPLETE
 *
 * Each state transitions based on the result of the previous step:
 *   - ODA fail          → AAC (decline)
 *   - Terminal risk     → ARQC (online) if floor/random/forced
 *   - Card risk decline → AAC (decline)
 *   - CVM fail          → AAC (decline)
 *   - All pass          → TC (offline approved)
 *   - ARQC + ARC=00     → TC (online approved)
 *   - ARQC + ARC≠00     → AAC (online declined)
 *
 * The state machine is the top-level controller — it can be used standalone
 * or via the EMV engine's getStateMachine() accessor.
 */

import { EMVCardFlow } from './emv-card-flow';
import type { CardFlowResult } from './emv-card-flow';
import { OfflineDataAuthentication } from './offline-data-authentication';
import type { AuthenticationResult, CAPK } from './offline-data-authentication';
import { TerminalRiskManagement } from './terminal-risk-management';
import type { TerminalRiskResult } from './terminal-risk-management';
import { CardRiskManagement } from './card-risk-management';
import type { CardRiskResult } from './card-risk-management';
import { CVMProcessor } from './cvm-processor';
import type { CVMResult } from './cvm-processor';
import { ACCryptogramGenerator } from './ac-generator';
import type { ACResult } from './ac-generator';
import { OnlineAuth } from './online-auth';
import type { OnlineAuthRequest, OnlineAuthResponse } from './online-auth';
import { IssuerScriptProcessor } from './issuer-script';
import type { ScriptResult, IssuerAuthResult } from './issuer-script';
import { PinPad } from './pin-pad';
import { OfflinePIN } from './offline-pin';
import type { CardInterface } from './pos-apdu-bridge';

// ── Types ──────────────────────────────────────────────────────────────────────

export type EMVState =
  | 'INIT'
  | 'CARD_FLOW'
  | 'ODA'
  | 'TERMINAL_RISK'
  | 'CARD_RISK'
  | 'CVM'
  | 'DECISION'
  | 'AC_GENERATION'
  | 'ONLINE'
  | 'ISSUER_SCRIPTS'
  | 'COMPLETE'
  | 'ERROR';

export interface EMVStateResult {
  /** Final state reached */
  state: EMVState;
  /** Final decision: TC (approved), ARQC (online), AAC (decline) */
  decision: 'TC' | 'ARQC' | 'AAC';
  /** Merged card TLV from READ RECORD */
  tlv: string;
  /** Application Cryptogram hex */
  ac: string;
  /** Cryptogram Information Data */
  cid: string;
  /** Application Transaction Counter */
  atc: string;
  /** Card flow result (AID, label, AIP, AFL) */
  flow?: CardFlowResult;
  /** ODA result */
  oda?: AuthenticationResult;
  /** Terminal risk result */
  terminalRisk?: TerminalRiskResult;
  /** Card risk result */
  cardRisk?: CardRiskResult;
  /** CVM result */
  cvm?: CVMResult;
  /** Online authorization request (if ARQC) */
  onlineRequest?: OnlineAuthRequest;
  /** Online authorization response (if ARQC) */
  onlineResponse?: OnlineAuthResponse;
  /** Issuer authentication result (if ARQC) */
  issuerAuth?: IssuerAuthResult;
  /** Issuer script execution result (if ARQC) */
  scripts?: ScriptResult;
  /** Error message (if state = ERROR) */
  error?: string;
}

export interface EMVStateMachineConfig {
  /** CAPKs loaded in terminal */
  capks?: CAPK[];
  /** Amount in minor units (e.g. cents) */
  amount: number;
  /** Terminal data TLV hex */
  terminalTLVHex: string;
  /** Optional: pre-known AID to skip PPSE */
  preferredAIDs?: string[];
  /** Optional: PIN entered by cardholder */
  pinEntered?: string;
  /** Optional: issuer response hex (for testing online path) */
  issuerResponseHex?: string;
  /** Optional: supported CVM methods */
  cvmMethods?: string[];
}

// ── State Machine ──────────────────────────────────────────────────────────────

export class EMVStateMachine {
  private card: CardInterface;

  private flow: EMVCardFlow;
  private oda: OfflineDataAuthentication;
  private termRisk: TerminalRiskManagement;
  private cardRisk: CardRiskManagement;
  private cvm: CVMProcessor;
  private acGen: ACCryptogramGenerator;
  private online: OnlineAuth;
  private scripts: IssuerScriptProcessor;
  private pinPad: PinPad;
  private offlinePin: OfflinePIN;

  constructor(card: CardInterface, capks: CAPK[] = []) {
    this.card = card;

    this.flow = new EMVCardFlow(card);
    this.oda = new OfflineDataAuthentication(capks);
    this.termRisk = new TerminalRiskManagement();
    this.cardRisk = new CardRiskManagement();
    this.cvm = new CVMProcessor();
    this.acGen = new ACCryptogramGenerator();
    this.online = new OnlineAuth();
    this.scripts = new IssuerScriptProcessor(card);
    this.pinPad = new PinPad();
    this.offlinePin = new OfflinePIN(card);
  }

  /**
   * Execute the full EMV L2 state machine.
   *
   * @param config  Transaction configuration (amount, terminal data, etc.)
   * @returns       Complete state machine result
   */
  async run(config: EMVStateMachineConfig): Promise<EMVStateResult> {
    let state: EMVState = 'INIT';
    let decision: 'TC' | 'ARQC' | 'AAC' = 'TC';
    let cardTLV = '';
    let flowResult: CardFlowResult | undefined;
    let odaResult: AuthenticationResult | undefined;
    let termRiskResult: TerminalRiskResult | undefined;
    let cardRiskResult: CardRiskResult | undefined;
    let cvmResult: CVMResult | undefined;
    let acResult: ACResult | undefined;
    let onlineReq: OnlineAuthRequest | undefined;
    let onlineResp: OnlineAuthResponse | undefined;
    let issuerAuth: IssuerAuthResult | undefined;
    let scriptResp: ScriptResult | undefined;

    try {
      // ── State: CARD_FLOW ────────────────────────────────────────────────
      state = 'CARD_FLOW';
      flowResult = await this.flow.run(config.terminalTLVHex, config.preferredAIDs);
      cardTLV = flowResult.tlv;

      if (!flowResult.aid) {
        return this.errorResult('CARD_FLOW', 'No application selected');
      }

      // ── State: ODA ──────────────────────────────────────────────────────
      state = 'ODA';
      odaResult = await this.oda.authenticate(cardTLV, config.terminalTLVHex);

      if (!odaResult.success) {
        decision = 'AAC';
        state = 'DECISION';
      }

      // ── State: TERMINAL_RISK ────────────────────────────────────────────
      if (decision !== 'AAC') {
        state = 'TERMINAL_RISK';
        termRiskResult = this.termRisk.evaluate(cardTLV, config.amount);

        if (termRiskResult.requiresOnline) {
          decision = 'ARQC';
        }
      }

      // ── State: CARD_RISK ────────────────────────────────────────────────
      if (decision !== 'AAC') {
        state = 'CARD_RISK';
        cardRiskResult = this.cardRisk.checkCardRisk(cardTLV, config.amount);

        if (cardRiskResult.decline) {
          decision = 'AAC';
        } else if (cardRiskResult.requiresOnline) {
          decision = 'ARQC';
        }
      }

      // ── State: CVM ──────────────────────────────────────────────────────
      if (decision !== 'AAC') {
        state = 'CVM';
        cvmResult = await this.cvm.process(cardTLV, config.pinEntered, this.pinPad);

        if (!cvmResult.success && config.pinEntered) {
          const pinResult = await this.offlinePin.verify(config.pinEntered);
          if (!pinResult.success) {
            decision = 'AAC';
          }
        }

        if (!cvmResult.success && decision !== 'AAC') {
          decision = 'AAC';
        }
      }

      // ── State: AC_GENERATION ────────────────────────────────────────────
      state = 'AC_GENERATION';
      const acType = decision === 'ARQC' ? 'ARQC' : decision === 'TC' ? 'TC' : 'AAC';
      acResult = await this.acGen.generateAC(cardTLV, config.terminalTLVHex, acType);

      // ── State: ONLINE (if ARQC) ─────────────────────────────────────────
      if (decision === 'ARQC') {
        state = 'ONLINE';

        // Build online authorization request
        onlineReq = this.online.build(cardTLV, config.terminalTLVHex, acResult);

        // Process issuer response (if provided)
        if (config.issuerResponseHex) {
          const fullResult = await this.scripts.processFullResponse(config.issuerResponseHex);
          onlineResp = this.online.parseResponse(config.issuerResponseHex);
          issuerAuth = fullResult.auth;

          // ── State: ISSUER_SCRIPTS ───────────────────────────────────────
          state = 'ISSUER_SCRIPTS';
          scriptResp = fullResult.scripts;

          // ARC handling: 00=approved → TC, anything else → AAC
          if (onlineResp.arc !== '00') {
            decision = 'AAC';
          } else {
            decision = 'TC';
          }
        } else {
          // No issuer response — remain ARQC (requires online)
          // The caller should send onlineReq to the host and call
          // processOnlineResponse() with the issuer response.
        }
      }

      // ── State: COMPLETE ─────────────────────────────────────────────────
      state = 'COMPLETE';

      return {
        state,
        decision,
        tlv: cardTLV,
        ac: acResult.ac,
        cid: acResult.cid,
        atc: acResult.atc,
        flow: flowResult,
        oda: odaResult,
        terminalRisk: termRiskResult,
        cardRisk: cardRiskResult,
        cvm: cvmResult,
        onlineRequest: onlineReq,
        onlineResponse: onlineResp,
        issuerAuth,
        scripts: scriptResp,
      };

    } catch (err) {
      return this.errorResult(state, err instanceof Error ? err.message : 'Unknown error');
    }
  }

  /**
   * Process an online issuer response after ARQC.
   *
   * Call this after sending the online request to the host and
   * receiving the issuer response.
   *
   * @param issuerResponseHex  Issuer response TLV (hex)
   * @returns                  Online response + auth + scripts
   */
  async processOnlineResponse(issuerResponseHex: string): Promise<{
    response: OnlineAuthResponse;
    auth: IssuerAuthResult;
    scripts: ScriptResult;
  }> {
    const response = this.online.parseResponse(issuerResponseHex);
    const { auth, scripts } = await this.scripts.processFullResponse(issuerResponseHex);
    return { response, auth, scripts };
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  getCardFlow(): EMVCardFlow { return this.flow; }
  getODA(): OfflineDataAuthentication { return this.oda; }
  getTerminalRisk(): TerminalRiskManagement { return this.termRisk; }
  getCardRisk(): CardRiskManagement { return this.cardRisk; }
  getCVM(): CVMProcessor { return this.cvm; }
  getACGenerator(): ACCryptogramGenerator { return this.acGen; }
  getOnlineAuth(): OnlineAuth { return this.online; }
  getScriptProcessor(): IssuerScriptProcessor { return this.scripts; }
  getPinPad(): PinPad { return this.pinPad; }
  getOfflinePIN(): OfflinePIN { return this.offlinePin; }

  /** Add a CAPK to the terminal */
  addCAPK(capk: CAPK): void {
    this.oda.addCAPK(capk);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private errorResult(state: EMVState, error: string): EMVStateResult {
    return {
      state: 'ERROR',
      decision: 'AAC',
      tlv: '',
      ac: '',
      cid: '80',
      atc: '0000',
      error: `EMV state machine error at ${state}: ${error}`,
    };
  }
}
