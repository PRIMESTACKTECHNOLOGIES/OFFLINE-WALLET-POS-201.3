/**
 * Magstripe Reader + Track Parser — Track 1 / Track 2
 *
 * Parses magnetic stripe card data according to ISO/IEC 7813:
 *
 * Track 1 (IATA format — 79 chars, 210 bpi):
 *   %B<PAN>^<NAME>^<YYMM><SERVICE><DISCRETIONARY>?
 *   - Format code B (bank card)
 *   - Primary Account Number (PAN)
 *   - Cardholder name (surname/first/initial)
 *   - Expiry date (YYMM)
 *   - Service code (3 digits)
 *   - Discretionary data
 *
 * Track 2 (ABA format — 40 chars, 75 bpi):
 *   ;<PAN>=<YYMM><SERVICE><DISCRETIONARY>?
 *   - Separator: '=' or 'D' (ISO 7812 field separator)
 *   - Same fields as Track 1 minus the name
 *
 * Service Code (ISO/IEC 7813):
 *   Digit 1: Interchange & technology (1=intl, 2=intl+IC, 5=national, 7=private)
 *   Digit 2: Authorization processing (0=normal, 2=issuer auth, 4=issuer auth+IC)
 *   Digit 3: Range & services (0=no restriction, 1=intl, 2=issuer auth must)
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MagstripeData {
  /** Raw Track 1 data (if present) */
  track1?: string;
  /** Raw Track 2 data (if present) */
  track2?: string;
  /** Primary Account Number (PAN) */
  pan: string;
  /** Expiry date — YYMM format */
  expiry: string;
  /** 3-digit service code */
  serviceCode: string;
  /** Cardholder name (Track 1 only) */
  name?: string;
  /** Discretionary data (CVV, PVV, etc.) */
  discretionary?: string;
  /** Which track was used for parsing */
  parsedFrom: 'TRACK1' | 'TRACK2';
}

export interface ServiceCodeInfo {
  /** Interchange & technology */
  interchange: string;
  /** Authorization processing */
  authorization: string;
  /** Range & services */
  services: string;
  /** Whether the card has an IC chip (service code digit 1 = 2/6) */
  hasChip: boolean;
}

// ── Magstripe Reader ────────────────────────────────────────────────────────────

export class MagstripeReader {
  private track1: string | null = null;
  private track2: string | null = null;

  /**
   * Inject swipe data from the physical MSR device.
   *
   * @param track1  Raw Track 1 data (null if not read)
   * @param track2  Raw Track 2 data (null if not read)
   */
  onSwipe(track1: string | null, track2: string | null): void {
    this.track1 = track1;
    this.track2 = track2;
  }

  /**
   * Check whether magstripe data has been received from a swipe.
   */
  hasData(): boolean {
    return this.track1 !== null || this.track2 !== null;
  }

  /**
   * Clear stored swipe data.
   */
  reset(): void {
    this.track1 = null;
    this.track2 = null;
  }

  /**
   * Parse the magstripe data.
   *
   * Prefers Track 1 (has cardholder name) but falls back to Track 2.
   *
   * @returns Parsed magstripe data
   * @throws  {Error} If no swipe data is available or parsing fails
   */
  parse(): MagstripeData {
    if (!this.track1 && !this.track2) {
      throw new Error('NO_MAGSTRIPE_DATA');
    }

    // Prefer Track 1 (has name), fall back to Track 2
    if (this.track1) {
      try {
        return this.parseTrack1(this.track1);
      } catch {
        // Track 1 parse failed — try Track 2 if available
        if (this.track2) {
          return this.parseTrack2(this.track2);
        }
        throw new Error('TRACK1_PARSE_ERROR');
      }
    }

    return this.parseTrack2(this.track2!);
  }

  /**
   * Parse Track 1 (IATA format).
   *
   * Format: %B<PAN>^<NAME>^<YYMM><SERVICE><DISCRETIONARY>?
   *
   * Example: %B4111111111111111^SMITH/JOHN^25121010000000000000?
   */
  private parseTrack1(t1: string): MagstripeData {
    // Strip sentinels (% and ?) and parse
    const clean = t1.replace(/^[%;]?/, '').replace(/\?$/, '');

    // Format: B<PAN>^<NAME>^<YYMM><SERVICE><DISCRETIONARY>
    const match = clean.match(/^B(\d{12,19})\^([^/^]+)\^(\d{2})(\d{2})(\d{3})(.*)$/);

    if (!match) throw new Error('TRACK1_PARSE_ERROR');

    const [, pan, name, expYear, expMonth, serviceCode, discretionary] = match;

    return {
      track1: t1,
      pan,
      expiry: expYear + expMonth,
      serviceCode,
      name: name.trim(),
      discretionary: discretionary || undefined,
      parsedFrom: 'TRACK1',
    };
  }

  /**
   * Parse Track 2 (ABA format).
   *
   * Format: ;<PAN>=<YYMM><SERVICE><DISCRETIONARY>?
   *    or:  <PAN>D<YYMM><SERVICE><DISCRETIONARY>
   *
   * The field separator can be '=' (standard) or 'D' (ISO 7812).
   *
   * Example: ;4111111111111111=25121010000000000000?
   */
  private parseTrack2(t2: string): MagstripeData {
    // Strip sentinels (; and ?)
    const clean = t2.replace(/^[;]?/, '').replace(/\?$/, '');

    // Format: <PAN>[=D]<YYMM><SERVICE><DISCRETIONARY>
    // Separator is '=' or 'D'
    const match = clean.match(/^(\d{12,19})[=D](\d{2})(\d{2})(\d{3})(.*)$/);

    if (!match) throw new Error('TRACK2_PARSE_ERROR');

    const [, pan, expYear, expMonth, serviceCode, discretionary] = match;

    return {
      track2: t2,
      pan,
      expiry: expYear + expMonth,
      serviceCode,
      discretionary: discretionary || undefined,
      parsedFrom: 'TRACK2',
    };
  }

  /**
   * Decode the 3-digit service code into meaningful information.
   *
   * ISO/IEC 7813 service code:
   *
   * Digit 1 — Interchange & technology:
   *   0 = Not interchangeable
   *   1 = International interchange
   *   2 = International interchange + IC (chip card)
   *   3 = Reserved
   *   5 = National interchange
   *   6 = National interchange + IC (chip card)
   *   7 = Private (no interchange)
   *
   * Digit 2 — Authorization processing:
   *   0 = Normal authorization
   *   2 = Issuer must be contacted via online means
   *   4 = Issuer must be contacted via online means + IC
   *
   * Digit 3 — Range & services:
   *   0 = No restrictions
   *   1 = International interchange
   *   2 = Issuer must be contacted
   *   4 = Issuer must be contacted + IC
   *
   * @param serviceCode  3-digit service code string
   * @returns            Decoded service code info
   */
  static decodeServiceCode(serviceCode: string): ServiceCodeInfo {
    const d1 = serviceCode[0] || '0';
    const d2 = serviceCode[1] || '0';
    const d3 = serviceCode[2] || '0';

    const interchangeMap: Record<string, string> = {
      '0': 'Not interchangeable',
      '1': 'International interchange',
      '2': 'International interchange + IC',
      '5': 'National interchange',
      '6': 'National interchange + IC',
      '7': 'Private (no interchange)',
    };

    const authMap: Record<string, string> = {
      '0': 'Normal authorization',
      '2': 'Issuer must be contacted (online)',
      '4': 'Issuer must be contacted (online) + IC',
    };

    const servicesMap: Record<string, string> = {
      '0': 'No restrictions',
      '1': 'International interchange',
      '2': 'Issuer must be contacted',
      '4': 'Issuer must be contacted + IC',
    };

    return {
      interchange: interchangeMap[d1] || 'Unknown',
      authorization: authMap[d2] || 'Unknown',
      services: servicesMap[d3] || 'Unknown',
      hasChip: d1 === '2' || d1 === '6',
    };
  }
}
