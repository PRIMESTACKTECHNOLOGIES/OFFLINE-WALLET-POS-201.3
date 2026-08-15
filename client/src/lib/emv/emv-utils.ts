/**
 * Browser-safe EMV utilities — no Node.js Buffer dependency.
 * All hex/byte operations use Uint8Array + DataView only.
 */

/** Convert hex string to Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const padded = clean.length % 2 ? '0' + clean : clean;
  const arr = new Uint8Array(padded.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(padded.substring(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

/** Convert Uint8Array to hex string (uppercase) */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Get a specific byte from a hex string (0-indexed) */
export function hexByte(hex: string, index: number): number {
  const bytes = hexToBytes(hex);
  return index < bytes.length ? bytes[index] : 0;
}

/** Check if a specific bit is set in a hex string at byte/bit position */
export function isBitSet(hex: string, byteIndex: number, bitMask: number): boolean {
  return (hexByte(hex, byteIndex) & bitMask) !== 0;
}

/** Set a bit in a 5-byte TVR hex string */
export function setTVRBit(tvr: string, byteIndex: number, bitMask: number): string {
  const bytes = hexToBytes(tvr.padEnd(10, '0').substring(0, 10));
  if (byteIndex >= 0 && byteIndex < bytes.length) {
    bytes[byteIndex] = bytes[byteIndex] | bitMask;
  }
  return bytesToHex(bytes);
}

/** Set a bit in a 2-byte TSI hex string */
export function setTSIBit(tsi: string, byteIndex: number, bitMask: number): string {
  const bytes = hexToBytes(tsi.padEnd(4, '0').substring(0, 4));
  if (byteIndex >= 0 && byteIndex < bytes.length) {
    bytes[byteIndex] = bytes[byteIndex] | bitMask;
  }
  return bytesToHex(bytes);
}

/** Generate a cryptographically random 4-byte unpredictable number (hex) */
export function generateUnpredictableNumber(): string {
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

/** Current date in YYMMDD format */
export function txnDate(): string {
  const d = new Date();
  const yy = d.getFullYear().toString().slice(2);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return yy + mm + dd;
}

/** Current time in HHMMSS format */
export function txnTime(): string {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0')
       + d.getMinutes().toString().padStart(2, '0')
       + d.getSeconds().toString().padStart(2, '0');
}
