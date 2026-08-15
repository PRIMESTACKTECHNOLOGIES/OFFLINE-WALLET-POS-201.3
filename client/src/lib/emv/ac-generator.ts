/**
 * AC Cryptogram Generator — ARQC / TC / AAC
 *
 * Generates EMV Application Cryptograms using the AC input block:
 *   1. Extract CDOL1 fields from card + terminal data
 *   2. Build AC input block (amount, country, TVR, currency, date, type, UN, ATC, IAD)
 *   3. Compute MAC over the input block
 *   4. Return CID + AC + ATC
 *
 * EMV Book 2 §4.2 / Book 3 §6.5.9 — GENERATE AC
 *
 * CID (Cryptogram Information Data):
 *   0x00 = ARQC (Authorization Request Cryptogram — online)
 *   0x40 = TC   (Transaction Certificate — offline approval)
 *   0x80 = AAC  (Application Authentication Cryptogram — decline)
 *
 * AC input block fields (CDOL1):
 *   9F02 — Amount Authorized
 *   9F03 — Amount Other
 *   9F1A — Terminal Country Code
 *   95   — Terminal Verification Results
 *   5F2A — Transaction Currency Code
 *   9A   — Transaction Date
 *   9C   — Transaction Type
 *   9F37 — Unpredictable Number
 *   9F36 — Application Transaction Counter (ATC)
 *   9F10 — Issuer Application Data (IAD)
 */

import { TLVParser } from './tlv-parser';
import type { EMVTag } from './tlv-parser';

export interface ACResult {
  /** Cryptogram Information Data — 00=ARQC, 40=TC, 80=AAC */
  cid: string;
  /** Application Cryptogram — hex (8 bytes MAC) */
  ac: string;
  /** Application Transaction Counter — hex (2 bytes) */
  atc: string;
  /** Issuer Application Data — hex */
  iad?: string;
  /** Raw cryptogram bytes */
  raw: Uint8Array;
}

/** CDOL1 field order — EMV Book 3 Annex A */
const CDOL1_FIELDS = [
  '9F02', // Amount Authorized (6 bytes)
  '9F03', // Amount Other (6 bytes)
  '9F1A', // Terminal Country Code (2 bytes)
  '95',   // Terminal Verification Results (5 bytes)
  '5F2A', // Transaction Currency Code (2 bytes)
  '9A',   // Transaction Date (3 bytes)
  '9C',   // Transaction Type (1 byte)
  '9F37', // Unpredictable Number (4 bytes)
  '9F36', // Application Transaction Counter (2 bytes)
  '9F10', // Issuer Application Data (variable)
];

export class ACCryptogramGenerator {
  /**
   * Generate an Application Cryptogram.
   *
   * @param cardDataHex     Card TLV data (hex) — contains ATC, IAD, etc.
   * @param terminalDataHex Terminal TLV data (hex) — contains amount, TVR, etc.
   * @param type            Cryptogram type: ARQC (online), TC (approve), AAC (decline)
   * @returns               AC result with CID, AC, ATC
   */
  async generateAC(
    cardDataHex: string,
    terminalDataHex: string,
    type: 'ARQC' | 'TC' | 'AAC'
  ): Promise<ACResult> {
    const cardTags = TLVParser.parseTLV(cardDataHex);
    const terminalTags = TLVParser.parseTLV(terminalDataHex);

    // Get Application Transaction Counter (tag 9F36)
    const atc = TLVParser.getTagValue(cardTags, '9F36') || '0000';

    // Get Issuer Application Data (tag 9F10)
    const iad = TLVParser.getTagValue(cardTags, '9F10') || undefined;

    // Determine CID based on cryptogram type
    const cid = this.cid(type);

    // Build AC input block from CDOL1 fields
    const input = this.buildACInput(cardTags, terminalTags, cid);

    // Compute MAC (cryptogram) over the input block
    const acBytes = await this.mac(input);

    return {
      cid,
      ac: this.bytesToHex(acBytes),
      atc,
      iad,
      raw: acBytes
    };
  }

  /**
   * Map cryptogram type to CID value.
   *
   * CID byte:
   *   Bits 7-6: 00=ARQC, 01=TC, 10=AAC
   *   Bit 5:    Advice required
   *   Bits 4-2: Reserved
   *   Bit 1:    CDA signature (for CDA)
   */
  private cid(type: 'ARQC' | 'TC' | 'AAC'): string {
    switch (type) {
      case 'ARQC': return '00';
      case 'TC':   return '40';
      case 'AAC':  return '80';
    }
  }

  /**
   * Build the AC input block from CDOL1 fields.
   *
   * Concatenates field values in CDOL1 order, then appends CID.
   * Fields are sourced from card tags first, then terminal tags.
   */
  private buildACInput(
    cardTags: EMVTag[],
    terminalTags: EMVTag[],
    cid: string
  ): Uint8Array {
    let hex = '';

    for (const tag of CDOL1_FIELDS) {
      const value =
        TLVParser.getTagValue(cardTags, tag) ||
        TLVParser.getTagValue(terminalTags, tag) ||
        '';
      hex += value;
    }

    // Append CID as the final byte
    hex += cid;

    return this.hexToBytes(hex);
  }

  /**
   * Compute MAC (Message Authentication Code) over the input data.
   *
   * Uses AES-CBC with a session key, taking the first 8 bytes of the
   * final encrypted block as the MAC.
   *
   * Production note: EMV specifies a proprietary MAC algorithm (Retail MAC
   * / ISO 9797-1 Algorithm 3 with triple-DES). For software fallback, this
   * uses AES-CBC as a placeholder. Replace with the EMV MAC computation
   * (or delegate to the card's GENERATE AC response) for production.
   *
   * In a real EMV flow, the card computes the AC and returns it in the
   * GENERATE AC response. This method is for offline terminal-side
   * cryptogram computation when card response is not available.
   */
  private async mac(data: Uint8Array): Promise<Uint8Array> {
    // Pad data to AES block size (16 bytes) with 0x80 0x00... (ISO 7816-4 padding)
    const blockSize = 16;
    const paddedLen = Math.ceil((data.length + 1) / blockSize) * blockSize;
    const padded = new Uint8Array(paddedLen);
    padded.set(data);
    padded[data.length] = 0x80; // ISO 7816-4 padding

    // Import session key (zero key for simulation — replace with UDK in production)
    const key = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(16) as BufferSource,
      { name: 'AES-CBC' },
      false,
      ['encrypt']
    );

    const iv = new Uint8Array(16); // Zero IV
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv },
      key,
      padded as BufferSource
    );

    // MAC = last 8 bytes of final encrypted block
    const encryptedBytes = new Uint8Array(encrypted);
    return encryptedBytes.slice(encryptedBytes.length - 8);
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
}
