/**
 * POS APDU Bridge — Unified ICC + NFC card interface
 *
 * Provides a transport-agnostic APDU command/response layer for
 * communicating with real payment cards via:
 *   - ICC (contact chip) through backend ACR122U/nfc-pcsc
 *   - NFC (contactless) through Web NFC API or backend reader
 *   - Simulated fallback for development
 *
 * All EMV APDUs flow through this bridge before reaching the card.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface APDUResponse {
  /** Response data bytes (may be empty for status-only responses) */
  data: Uint8Array;
  /** Status word 1 — 0x90 = success, 0x61 = more data, 0x63 = verification failed, etc. */
  sw1: number;
  /** Status word 2 — additional status info (e.g. remaining PIN tries) */
  sw2: number;
}

export interface APDUCommand {
  cla: number;   // Class byte
  ins: number;   // Instruction byte
  p1: number;    // Parameter 1
  p2: number;    // Parameter 2
  data?: Uint8Array;  // Command data
  le?: number;   // Expected response length (0 = max)
}

export interface CardInterface {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  transmit(apdu: Uint8Array): Promise<APDUResponse>;
  isConnected(): boolean;
}

/** Transport backends the bridge can use */
export type APDUTransport = 'acr122u' | 'webnfc' | 'simulated';

import { resolveApiBaseUrl } from '../backendUrl';

// ── APDU Builder ────────────────────────────────────────────────────────────────

/**
 * Encode an APDUCommand into raw bytes for transmission.
 * Supports both Case 1 (no data, no Le) through Case 4 (data + Le).
 */
export function buildAPDU(cmd: APDUCommand): Uint8Array {
  const hasData = cmd.data && cmd.data.length > 0;
  const hasLe = cmd.le !== undefined;
  const dataLen = hasData ? cmd.data!.length : 0;

  // Header: CLA INS P1 P2
  const header = new Uint8Array(4);
  header[0] = cmd.cla;
  header[1] = cmd.ins;
  header[2] = cmd.p1;
  header[3] = cmd.p2;

  if (hasData && hasLe) {
    // Case 4: Header + Lc + Data + Le
    const buf = new Uint8Array(5 + dataLen + 1);
    buf.set(header);
    buf[4] = dataLen;
    buf.set(cmd.data!, 5);
    buf[5 + dataLen] = cmd.le!;
    return buf;
  } else if (hasData) {
    // Case 3: Header + Lc + Data
    const buf = new Uint8Array(5 + dataLen);
    buf.set(header);
    buf[4] = dataLen;
    buf.set(cmd.data!, 5);
    return buf;
  } else if (hasLe) {
    // Case 2: Header + Le
    const buf = new Uint8Array(5);
    buf.set(header);
    buf[4] = cmd.le!;
    return buf;
  } else {
    // Case 1: Header only
    return header;
  }
}

/** Parse raw response bytes into APDUResponse */
export function parseResponse(raw: Uint8Array): APDUResponse {
  if (raw.length < 2) {
    return { data: new Uint8Array([]), sw1: 0x6F, sw2: 0x00 }; // General error
  }
  const data = raw.slice(0, raw.length - 2);
  const sw1 = raw[raw.length - 2];
  const sw2 = raw[raw.length - 1];
  return { data, sw1, sw2 };
}

// ── POS APDU Bridge ─────────────────────────────────────────────────────────────

export class POSAPDUBridge implements CardInterface {
  private connected = false;
  private transport: APDUTransport;
  private apiUrl: string;

  constructor(transport: APDUTransport = 'simulated', apiUrl?: string) {
    this.transport = transport;
    this.apiUrl = apiUrl || (typeof import.meta !== 'undefined'
      ? resolveApiBaseUrl({ envValue: import.meta.env?.VITE_API_URL, currentOrigin: window.location.origin })
      : 'http://localhost:7000');
  }

  async connect(): Promise<void> {
    switch (this.transport) {
      case 'acr122u':
        // Verify backend reader is available
        try {
          const res = await fetch(`${this.apiUrl}/merchant/v1/payments/read-acr122u/status`);
          const status = await res.json();
          if (!status.enabled) throw new Error('ACR122U reader not enabled');
        } catch (e) {
          throw new Error(`ACR122U reader unavailable: ${(e as Error).message}`);
        }
        break;

      case 'webnfc':
        if (typeof navigator === 'undefined' || !('NDEFReader' in navigator)) {
          throw new Error('Web NFC not supported in this browser');
        }
        break;

      case 'simulated':
        // No hardware needed
        break;
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getTransport(): APDUTransport {
    return this.transport;
  }

  async transmit(apdu: Uint8Array): Promise<APDUResponse> {
    if (!this.connected) {
      throw new Error('Card reader not connected');
    }

    switch (this.transport) {
      case 'acr122u':
        return this.transmitACR122U(apdu);
      case 'webnfc':
        return this.transmitWebNFC(apdu);
      case 'simulated':
      default:
        return this.transmitSimulated(apdu);
    }
  }

  // ── ACR122U backend transport ───────────────────────────────────────────────
  private async transmitACR122U(apdu: Uint8Array): Promise<APDUResponse> {
    const hex = this.bytesToHex(apdu);
    const res = await fetch(`${this.apiUrl}/merchant/v1/payments/acr122u/transmit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apdu: hex }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`ACR122U transmit failed: ${(err as any).error || res.statusText}`);
    }

    const { data } = await res.json();
    return parseResponse(this.hexToBytes(data));
  }

  // ── Web NFC transport ────────────────────────────────────────────────────────
  private async transmitWebNFC(_apdu: Uint8Array): Promise<APDUResponse> {
    // Web NFC (NDEFReader) does not support raw APDU — it uses NDEF messages.
    // For real contactless EMV, we'd need Web Smart Card API or a custom native bridge.
    // Fall back to simulated for now.
    console.warn('[APDU] Web NFC does not support raw ISO 7816 APDU — falling back to simulated');
    return this.transmitSimulated(_apdu);
  }

  // ── Simulated transport (dev/test) ──────────────────────────────────────────
  private transmitSimulated(apdu: Uint8Array): APDUResponse {
    const ins = apdu.length > 1 ? apdu[1] : 0;

    // Simulate standard EMV responses based on instruction byte
    switch (ins) {
      case 0xA4: // SELECT
        return { data: new Uint8Array([]), sw1: 0x90, sw2: 0x00 };
      case 0xB2: // READ RECORD
        return { data: new Uint8Array([]), sw1: 0x90, sw2: 0x00 };
      case 0xA8: // GET PROCESSING OPTIONS
        return { data: new Uint8Array([0x80, 0x02, 0x00, 0x00]), sw1: 0x90, sw2: 0x00 };
      case 0x20: // VERIFY (PIN)
        return { data: new Uint8Array([]), sw1: 0x90, sw2: 0x00 };
      case 0xAE: // GENERATE AC
        return { data: new Uint8Array([0x80, 0x02, 0x00, 0x00]), sw1: 0x90, sw2: 0x00 };
      default:
        return { data: new Uint8Array([]), sw1: 0x90, sw2: 0x00 };
    }
  }

  // ── Hex utilities ────────────────────────────────────────────────────────────
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  private hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/[^0-9a-fA-F]/g, '');
    const arr = new Uint8Array(clean.length / 2);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return arr;
  }
}
