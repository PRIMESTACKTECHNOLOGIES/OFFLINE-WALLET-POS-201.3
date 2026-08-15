/**
 * NFC Reader — Contactless card APDU interface
 *
 * Wraps POSAPDUBridge with high-level contactless EMV commands:
 *   PPSE (Proximity Payment System Environment)
 *   SELECT, GPO, READ RECORD, GENERATE AC
 *
 * Supports contactless kernel types:
 *   - Visa payWave (qVSDC)
 *   - Mastercard PayPass (M/Chip)
 *   - American Express ExpressPay
 *   - Discover D-PAS
 */

import { POSAPDUBridge, buildAPDU, type APDUResponse, type APDUTransport } from './pos-apdu-bridge';

// ── Contactless AIDs ──────────────────────────────────────────────────────────

export const PPSE_AID = '325041592E5359532E4444463031'; // "2PAY.SYS.DDF01"

export const CONTACTLESS_AIDS: Record<string, string> = {
  'visa':        'A0000000041010',
  'mastercard':  'A0000000031010',
  'amex':        'A00000002501',
  'discover':    'A0000000651010',
  'jcb':         'A0000000651010',
  'unionpay':    'A000000333010101',
};

export class NFCReader {
  private bridge: POSAPDUBridge;

  constructor(transport: APDUTransport = 'simulated') {
    this.bridge = new POSAPDUBridge(transport);
  }

  /** Open NFC field / activate reader */
  async open(): Promise<void> {
    await this.bridge.connect();
  }

  /** Deactivate NFC field */
  async close(): Promise<void> {
    await this.bridge.disconnect();
  }

  /** Check if reader is active */
  isConnected(): boolean {
    return this.bridge.isConnected();
  }

  /** Expose the underlying APDU bridge for sub-modules */
  getBridge(): POSAPDUBridge {
    return this.bridge;
  }

  /** Poll for a contactless card (device-specific) */
  async poll(): Promise<boolean> {
    // Device-specific NFC polling — returns true if card in field
    // For simulated/ACR122U, the connect() already establishes the link
    return this.bridge.isConnected();
  }

  /** Send raw APDU hex string */
  async sendAPDU(hex: string): Promise<APDUResponse> {
    const apdu = this.hexToBytes(hex);
    return this.bridge.transmit(apdu);
  }

  // ── Contactless EMV Commands ────────────────────────────────────────────────

  /**
   * SELECT PPSE — EMV Contactless Book C-3 §3.1
   * Select the Proximity Payment System Environment to discover available applications.
   *
   * Response contains tag 4F (application AID) and tag 50 (application label).
   */
  async selectPPSE(): Promise<APDUResponse> {
    const ppseBytes = this.hexToBytes(PPSE_AID);
    const apdu = buildAPDU({
      cla: 0x00,
      ins: 0xA4,    // SELECT
      p1: 0x04,     // Select by DF name
      p2: 0x00,
      data: ppseBytes,
      le: 0x00,
    });
    return this.bridge.transmit(apdu);
  }

  /**
   * SELECT Application — EMV Contactless Book C-3 §3.2
   * Select a specific contactless payment application by AID.
   *
   * @param aidHex  Application AID, e.g. "A0000000041010" for Visa qVSDC
   */
  async selectApplication(aidHex: string): Promise<APDUResponse> {
    const aid = this.hexToBytes(aidHex);
    const apdu = buildAPDU({
      cla: 0x00,
      ins: 0xA4,
      p1: 0x04,     // Select by DF name
      p2: 0x00,
      data: aid,
      le: 0x00,
    });
    return this.bridge.transmit(apdu);
  }

  /**
   * GET PROCESSING OPTIONS — EMV Contactless Book C-3 §3.3
   * Initiates contactless transaction processing.
   *
   * @param pdolData  PDOL-related data (tag 83 with CDOL data)
   */
  async getProcessingOptions(pdolData: Uint8Array): Promise<APDUResponse> {
    const apdu = buildAPDU({
      cla: 0x80,
      ins: 0xA8,    // GPO
      p1: 0x00,
      p2: 0x00,
      data: pdolData,
      le: 0x00,
    });
    return this.bridge.transmit(apdu);
  }

  /**
   * READ RECORD — EMV Contactless Book C-3 §3.4
   * Read a record from a specific SFI (needed for some contactless kernels).
   *
   * @param sfi       Short File Identifier (1–30)
   * @param recordNum Record number to read
   */
  async readRecord(sfi: number, recordNum: number): Promise<APDUResponse> {
    const apdu = buildAPDU({
      cla: 0x00,
      ins: 0xB2,    // READ RECORD
      p1: recordNum,
      p2: (sfi << 3) | 0x04,
      le: 0x00,
    });
    return this.bridge.transmit(apdu);
  }

  /**
   * GENERATE AC — EMV Contactless Book C-3 §3.5
   * Request the card to generate a transaction cryptogram.
   *
   * @param type    'TC' | 'AAC' | 'ARQC'
   * @param cdol2   CDOL2-related data
   */
  async generateAC(type: 'TC' | 'AAC' | 'ARQC', cdol2: Uint8Array): Promise<APDUResponse> {
    const p1 = type === 'TC' ? 0x40 : type === 'ARQC' ? 0x00 : 0x00;

    const apdu = buildAPDU({
      cla: 0x80,
      ins: 0xAE,    // GENERATE AC
      p1,
      p2: 0x00,
      data: cdol2,
      le: 0x00,
    });
    return this.bridge.transmit(apdu);
  }

  /**
   * RECOVER AC — EMV Contactless Book C-3
   * Recover the cryptogram after an online authorization (for qVSDC).
   *
   * @param authResponse  Issuer authentication data (tag 91)
   */
  async recoverAC(authResponse: Uint8Array): Promise<APDUResponse> {
    const apdu = buildAPDU({
      cla: 0x80,
      ins: 0xC0,    // RECOVER AC
      p1: 0x00,
      p2: 0x00,
      data: authResponse,
      le: 0x00,
    });
    return this.bridge.transmit(apdu);
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  private hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/[^0-9a-fA-F]/g, '');
    const arr = new Uint8Array(clean.length / 2);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return arr;
  }
}
