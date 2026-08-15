/**
 * AID Selector — SELECT PPSE → Parse AIDs → SELECT AID
 *
 * Implements the EMV application selection flow:
 *   1. SELECT PPSE (2PAY.SYS.DDF01) to discover available applications
 *   2. Parse response for AID list (tag 4F)
 *   3. SELECT each AID to get application template + label
 *   4. Return selected application with AID + label + FCI data
 *
 * EMV Book 1 §12 — Application Selection
 * EMV Book 1 §11.3 — SELECT command
 *
 * PPSE APDU: 00 A4 04 00 0E 325041592E5359532E4444463031 00
 *   "2PAY.SYS.DDF01" = Proximity Payment System Environment
 */

import type { CardInterface } from './pos-apdu-bridge';
import { TLVParser } from './tlv-parser';

export interface AIDSelectResult {
  /** Application Identifier (hex) */
  aid: string;
  /** Application label (ASCII from tag 50) */
  label?: string;
  /** Application priority indicator (from tag 87) */
  priority?: number;
  /** Language preference (from tag 5F2D) */
  language?: string;
  /** Full FCI (File Control Information) raw response */
  raw: Uint8Array;
}

/** Well-known payment AIDs for fallback matching */
export const PAYMENT_AIDS: Record<string, string> = {
  'visa_debit':     'A0000000041010',
  'visa_credit':    'A0000000043060',
  'visa_electron':  'A0000000042010',
  'mastercard':     'A0000000031010',
  'mastercard_debit': 'A0000000032010',
  'amex':           'A00000002501',
  'discover':       'A0000000651010',
  'jcb':            'A0000000651010',
  'unionpay':       'A000000333010101',
  'rupay':          'A0000005241010',
};

export class AIDSelector {
  private card: CardInterface;

  constructor(card: CardInterface) {
    this.card = card;
  }

  /**
   * SELECT PPSE — Discover available payment applications on the card.
   *
   * Sends: 00 A4 04 00 0E 325041592E5359532E4444463031 00
   *
   * Response contains Application Template (tag 61) with:
   *   - Tag 4F: Application Identifier (AID)
   *   - Tag 50: Application Label
   *   - Tag 87: Application Priority Indicator
   *   - Tag 9F12: Application Preferred Name
   *
   * @returns Array of AID hex strings found on the card
   */
  async selectPPSE(): Promise<string[]> {
    // SELECT PPSE: "2PAY.SYS.DDF01"
    const ppseHex = '00A404000E325041592E5359532E444446303100';
    const apdu = this.hexToBytes(ppseHex);

    const resp = await this.card.transmit(apdu);

    if (resp.sw1 !== 0x90 || resp.sw2 !== 0x00) {
      return [];
    }

    const hex = this.bytesToHex(resp.data);
    const tlv = TLVParser.parseTLV(hex);

    const aids: string[] = [];

    // Extract all AIDs (tag 4F) from response
    // They may be nested inside Application Template (tag 61)
    this.extractAIDs(tlv, aids);

    return aids;
  }

  /**
   * SELECT AID — Select a specific payment application.
   *
   * Sends: 00 A4 04 00 [Lc] [AID] 00
   *
   * Response FCI contains:
   *   - Tag 50: Application Label
   *   - Tag 82: Application Interchange Profile (AIP)
   *   - Tag 87: Application Priority Indicator
   *   - Tag 9F38: Processing Options Data Object List (PDOL)
   *
   * @param aidHex  Application AID as hex string
   * @returns       Selection result with label/priority, or null if not found
   */
  async selectAID(aidHex: string): Promise<AIDSelectResult | null> {
    const aidBytes = this.hexToBytes(aidHex);

    // Build SELECT APDU: CLA INS P1 P2 Lc Data Le
    const apdu = new Uint8Array(5 + aidBytes.length + 1);
    apdu[0] = 0x00;   // CLA
    apdu[1] = 0xA4;   // INS = SELECT
    apdu[2] = 0x04;   // P1 = Select by DF name
    apdu[3] = 0x00;   // P2 = First or only occurrence
    apdu[4] = aidBytes.length;  // Lc
    apdu.set(aidBytes, 5);      // Data = AID
    apdu[5 + aidBytes.length] = 0x00;  // Le = max response

    const resp = await this.card.transmit(apdu);

    if (resp.sw1 !== 0x90 || resp.sw2 !== 0x00) {
      return null;
    }

    const hex = this.bytesToHex(resp.data);
    const tlv = TLVParser.parseTLV(hex);

    // Extract application label (tag 50)
    const labelTag = tlv.find(t => t.tag === '50');
    const label = labelTag ? this.hexToAscii(labelTag.value) : undefined;

    // Extract priority indicator (tag 87)
    const priorityTag = tlv.find(t => t.tag === '87');
    const priority = priorityTag ? parseInt(priorityTag.value, 16) : undefined;

    // Extract language preference (tag 5F2D)
    const langTag = tlv.find(t => t.tag === '5F2D');
    const language = langTag ? this.hexToAscii(langTag.value) : undefined;

    return {
      aid: aidHex.toUpperCase(),
      label,
      priority,
      language,
      raw: resp.data
    };
  }

  /**
   * Select the best available application from the card.
   *
   * Flow:
   *   1. SELECT PPSE to get AID list
   *   2. If AIDs found, SELECT first one
   *   3. If PPSE fails, try well-known AIDs as fallback
   *
   * @param preferredAIDs  Optional preferred AID list (tried before fallback)
   * @returns              Selected application, or null if none found
   */
  async selectBestApplication(preferredAIDs?: string[]): Promise<AIDSelectResult | null> {
    // Step 1: Try PPSE discovery
    const ppseAIDs = await this.selectPPSE();

    if (ppseAIDs.length > 0) {
      // Select first AID from PPSE
      const result = await this.selectAID(ppseAIDs[0]);
      if (result) return result;
    }

    // Step 2: Try preferred AIDs
    if (preferredAIDs) {
      for (const aid of preferredAIDs) {
        const result = await this.selectAID(aid);
        if (result) return result;
      }
    }

    // Step 3: Fallback to well-known AIDs
    for (const aid of Object.values(PAYMENT_AIDS)) {
      const result = await this.selectAID(aid);
      if (result) return result;
    }

    return null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  /** Recursively extract AIDs (tag 4F) from TLV tree */
  private extractAIDs(tags: ReturnType<typeof TLVParser.parseTLV>, aids: string[]): void {
    for (const tag of tags) {
      if (tag.tag === '4F') {
        aids.push(tag.value.toUpperCase());
      }
    }
  }

  private hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/[^0-9a-fA-F]/g, '');
    const arr = new Uint8Array(clean.length / 2);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return arr;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  private hexToAscii(hex: string): string {
    return hex.match(/.{1,2}/g)
      ?.map(b => String.fromCharCode(parseInt(b, 16)))
      .join('') || '';
  }
}
