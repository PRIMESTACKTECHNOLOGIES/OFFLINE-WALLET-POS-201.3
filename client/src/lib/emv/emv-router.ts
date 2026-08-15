/**
 * EMV Router — Unified Contact / Contactless / Magstripe Dispatcher
 *
 * Automatically detects the card interface (ICC contact chip or NFC contactless)
 * and routes the transaction to the appropriate processing path:
 *
 *   CONTACT      → ICC chip detected → EMVStateMachine (full L2 flow)
 *   CONTACTLESS  → NFC card detected → ContactlessKernel mode detection
 *                   ├── qVSDC / EMV → EMVStateMachine (full L2 flow via NFC)
 *                   └── MAG          → Magstripe fallback (return CTL result)
 *   MAGSTRIPE    → Contactless MSD mode only
 *
 * Priority: ICC (contact) > NFC (contactless)
 *
 * EMV Book 1 §6.2 — Interface Selection
 * EMVCo Contactless Specifications — Application Selection
 */

import type { CardInterface } from './pos-apdu-bridge';
import { EMVStateMachine } from './emv-state-machine';
import type { EMVStateResult } from './emv-state-machine';
import type { CAPK } from './offline-data-authentication';
import { ContactlessKernel } from './contactless-kernel';
import type { CTLResult } from './contactless-kernel';
import { MagstripeReader } from './magstripe-reader';
import type { MagstripeData } from './magstripe-reader';

// ── Types ──────────────────────────────────────────────────────────────────────

export type RoutePath = 'CONTACT' | 'CONTACTLESS' | 'MAGSTRIPE';

export interface RouteResult {
  /** Which interface was used */
  path: RoutePath;
  /** Contactless mode (only for CONTACTLESS / MAGSTRIPE paths) */
  mode?: 'qVSDC' | 'EMV' | 'MAG';
  /** Full state machine result (CONTACT + CONTACTLESS qVSDC/EMV paths) */
  result?: EMVStateResult;
  /** Contactless kernel result (NFC MAG mode) */
  ctlResult?: CTLResult;
  /** Magstripe reader result (MSR swipe path) */
  magstripeResult?: MagstripeData;
  /** Detected payment scheme */
  scheme?: string;
  /** Selected AID */
  aid?: string;
}

export interface RouteConfig {
  /** Amount in minor units (e.g. cents) */
  amount: number;
  /** Terminal data TLV hex */
  terminalTLVHex: string;
  /** CAPKs loaded in terminal */
  capks?: CAPK[];
  /** Optional preferred AIDs */
  preferredAIDs?: string[];
  /** Optional cardholder PIN */
  pinEntered?: string;
  /** Optional issuer response hex (for online testing) */
  issuerResponseHex?: string;
}

// ── EMV Router ──────────────────────────────────────────────────────────────────

export class EMVRouter {
  private icc: CardInterface;
  private nfc: CardInterface;

  /** State machine for contact (ICC) transactions */
  private contactKernel: EMVStateMachine;
  /** State machine for contactless EMV/qVSDC transactions (uses NFC interface) */
  private ctlEMVKernel: EMVStateMachine;
  /** Contactless kernel for mode detection */
  private ctlKernel: ContactlessKernel;
  /** Magstripe reader for physical MSR swipes */
  private magstripe: MagstripeReader;

  constructor(icc: CardInterface, nfc: CardInterface, capks: CAPK[] = []) {
    this.icc = icc;
    this.nfc = nfc;

    // Contact path — state machine with ICC card interface
    this.contactKernel = new EMVStateMachine(icc, capks);

    // Contactless EMV path — state machine with NFC card interface
    this.ctlEMVKernel = new EMVStateMachine(nfc, capks);

    // Contactless kernel for mode detection (PPSE → AIP → mode)
    this.ctlKernel = new ContactlessKernel(nfc);

    // Magstripe reader (physical MSR device)
    this.magstripe = new MagstripeReader();
  }

  /**
   * Route a transaction based on detected card interface.
   *
   * Priority: ICC (contact) > NFC (contactless)
   *
   * @param config  Transaction configuration (amount, terminal data, PIN, etc.)
   * @returns       Routing result with full transaction outcome
   */
  async route(config: RouteConfig): Promise<RouteResult> {
    // ── 1. Check ICC (contact chip) ────────────────────────────────────────
    if (this.icc.isConnected()) {
      const result = await this.contactKernel.run({
        amount: config.amount,
        terminalTLVHex: config.terminalTLVHex,
        preferredAIDs: config.preferredAIDs,
        pinEntered: config.pinEntered,
        issuerResponseHex: config.issuerResponseHex,
      });

      return {
        path: 'CONTACT',
        result,
        aid: result.flow?.aid,
      };
    }

    // ── 2. Check NFC (contactless) ─────────────────────────────────────────
    if (this.nfc.isConnected()) {
      // First: detect mode via ContactlessKernel (PPSE → AID → GPO → AIP)
      const ctl = await this.ctlKernel.run(
        config.terminalTLVHex,
        config.preferredAIDs
      );

      // qVSDC / EMV mode → run full EMV state machine via NFC interface
      if (ctl.mode === 'qVSDC' || ctl.mode === 'EMV') {
        const result = await this.ctlEMVKernel.run({
          amount: config.amount,
          terminalTLVHex: config.terminalTLVHex,
          preferredAIDs: config.preferredAIDs,
          pinEntered: config.pinEntered,
          issuerResponseHex: config.issuerResponseHex,
        });

        return {
          path: 'CONTACTLESS',
          mode: ctl.mode,
          result,
          scheme: ctl.scheme,
          aid: ctl.aid,
        };
      }

      // MAG mode → magstripe fallback (no full EMV processing)
      return {
        path: 'MAGSTRIPE',
        mode: ctl.mode,
        ctlResult: ctl,
        scheme: ctl.scheme,
        aid: ctl.aid,
      };
    }

    // ── 3. Check Magstripe (physical MSR swipe) ────────────────────────
    if (this.magstripeDataAvailable()) {
      const magData = this.magstripe.parse();
      return {
        path: 'MAGSTRIPE',
        magstripeResult: magData,
      };
    }

    // ── 4. No card detected ─────────────────────────────────────────────────
    throw new Error('NO_CARD_PRESENT');
  }

  /**
   * Quick check — is any card present on any interface?
   */
  hasCard(): boolean {
    return this.icc.isConnected() || this.nfc.isConnected() || this.magstripe.hasData();
  }

  /**
   * Which interface has a card?
   *
   * @returns 'CONTACT' | 'CONTACTLESS' | 'MAGSTRIPE' | null
   */
  getActiveInterface(): 'CONTACT' | 'CONTACTLESS' | 'MAGSTRIPE' | null {
    if (this.icc.isConnected()) return 'CONTACT';
    if (this.nfc.isConnected()) return 'CONTACTLESS';
    if (this.magstripe.hasData()) return 'MAGSTRIPE';
    return null;
  }

  /**
   * Inject magstripe swipe data from physical MSR device.
   *
   * @param track1  Raw Track 1 data (null if not read)
   * @param track2  Raw Track 2 data (null if not read)
   */
  onMagstripeSwipe(track1: string | null, track2: string | null): void {
    this.magstripe.onSwipe(track1, track2);
  }

  /**
   * Check whether the magstripe reader has usable swipe data.
   */
  private magstripeDataAvailable(): boolean {
    try {
      return this.magstripe.parse() !== null;
    } catch {
      return false;
    }
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  getContactKernel(): EMVStateMachine { return this.contactKernel; }
  getContactlessEMVKernel(): EMVStateMachine { return this.ctlEMVKernel; }
  getContactlessKernel(): ContactlessKernel { return this.ctlKernel; }
  getMagstripeReader(): MagstripeReader { return this.magstripe; }
}
