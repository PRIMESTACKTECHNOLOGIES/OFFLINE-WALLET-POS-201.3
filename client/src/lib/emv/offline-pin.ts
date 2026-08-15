import type { CardInterface } from './pos-apdu-bridge';

export interface OfflinePinResult {
  success: boolean;
  retriesLeft: number | null;
  blocked: boolean;
  reason?: string;
}

export class OfflinePIN {
  private card: CardInterface;

  constructor(card: CardInterface) {
    this.card = card;
  }

  async verify(pin: string): Promise<OfflinePinResult> {
    if (!pin || !/^\d+$/.test(pin)) {
      return {
        success: false,
        retriesLeft: null,
        blocked: false,
        reason: 'PIN must contain only digits',
      };
    }

    const pinBytes = this.buildPinBytes(pin);
    const apdu = this.buildVerifyAPDU(pinBytes);

    const resp = await this.card.transmit(apdu);

    // SW1/SW2 handling:
    // 0x9000 → success
    // 0x63CX → fail, X = retries left
    // 0x63C0 → blocked
    const sw = (resp.sw1 << 8) | resp.sw2;

    if (sw === 0x9000) {
      return {
        success: true,
        retriesLeft: null,
        blocked: false,
      };
    }

    if (resp.sw1 === 0x63 && resp.sw2 >= 0xC0 && resp.sw2 <= 0xCF) {
      const retries = resp.sw2 & 0x0f;
      const blocked = retries === 0;

      return {
        success: false,
        retriesLeft: blocked ? 0 : retries,
        blocked,
        reason: blocked ? 'PIN blocked' : `PIN verification failed (${blocked ? 0 : retries} tries left)`,
      };
    }

    return {
      success: false,
      retriesLeft: null,
      blocked: false,
      reason: 'PIN verification returned an unexpected status word',
    };
  }

  private buildVerifyAPDU(pinBytes: Uint8Array): Uint8Array {
    const cla = 0x00;
    const ins = 0x20; // VERIFY
    const p1 = 0x00;
    const p2 = 0x80; // reference for offline PIN (scheme-specific)
    const lc = pinBytes.length;

    return new Uint8Array([cla, ins, p1, p2, lc, ...pinBytes]);
  }

  private buildPinBytes(pin: string): Uint8Array {
    // Simple numeric PIN, padded with 0xFF (EMV style)
    const bytes: number[] = [];

    for (let i = 0; i < pin.length; i++) {
      const d = parseInt(pin[i], 10);
      if (Number.isNaN(d)) continue;
      bytes.push(d);
    }

    while (bytes.length < 8) {
      bytes.push(0xFF);
    }

    return new Uint8Array(bytes.slice(0, 8));
  }
}
