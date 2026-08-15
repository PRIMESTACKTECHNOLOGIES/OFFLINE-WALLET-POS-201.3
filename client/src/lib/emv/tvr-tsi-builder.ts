/**
 * TVR / TSI Builder — EMV Book 3 §6.5 / §6.6
 *
 * Terminal Verification Results (TVR) — 5 bytes (10 hex chars)
 * Transaction Status Information (TSI) — 2 bytes (4 hex chars)
 *
 * Bit positions follow EMV Book 3, Table 4-5 and Table 4-6.
 */

export interface TVRContext {
  // Byte 1 — Offline Data Authentication results
  odaPerformed: boolean;
  odaFailed: boolean;
  sdaSelected: boolean;
  ddaFailed: boolean;
  cdaFailed: boolean;
  iccDataMissing: boolean;
  cardOnExceptionFile: boolean;

  // Byte 2 — Cardholder Verification results
  cardNotEffective: boolean;
  appExpired: boolean;
  appNotEffective: boolean;
  newCard: boolean;
  cvmFailed: boolean;
  unrecognisedCVM: boolean;
  pinTryLimitExceeded: boolean;

  // Byte 3 — Terminal Risk Management results
  pinPadMissingOrBroken: boolean;
  pinRequiredNotEntered: boolean;
  onlinePinEntered: boolean;
  exceedsFloorLimit: boolean;
  lowerOfflineLimitExceeded: boolean;
  upperOfflineLimitExceeded: boolean;
  randomOnlineSelected: boolean;
  merchantForcedOnline: boolean;

  // Byte 4 — Terminal Action / Issuer Auth / Script results
  defaultTDOLUsed: boolean;
  issuerAuthFailed: boolean;
  scriptFailedBeforeFinalAC: boolean;
  scriptFailedAfterFinalAC: boolean;
}

export interface TSIContext {
  offlineDataAuthenticationPerformed: boolean;
  cardholderVerificationPerformed: boolean;
  cardRiskManagementPerformed: boolean;
  issuerAuthPerformed: boolean;
  scriptProcessingPerformed: boolean;
}

export class TVRTSIBuilder {

  /**
   * Build 5-byte TVR (10 hex chars) per EMV Book 3 §6.5
   *
   * Byte 1 (bits 8→1): ODA not performed · SDA failed · ICC data missing ·
   *                      Card on exception file · DDA failed · CDA failed ·
   *                      SDA selected · RFU
   * Byte 2 (bits 8→1): Card not effective · App expired · App not yet effective ·
   *                      New card · CVM failed · Unrecognised CVM ·
   *                      PIN try limit exceeded · RFU
   * Byte 3 (bits 8→1): PIN pad missing/broken · PIN required, not entered ·
   *                      Online PIN entered · Exceeds floor limit ·
   *                      Lower consecutive offline limit exceeded ·
   *                      Upper consecutive offline limit exceeded ·
   *                      Random selection for online · Merchant forced online
   * Byte 4 (bits 8→1): Default TDOL used · Issuer auth failed ·
   *                      Script processing failed before final AC ·
   *                      Script processing failed after final AC · RFU×4
   * Byte 5: RFU (always 0x00)
   */
  static buildTVR(ctx: TVRContext): string {
    const b1 =
      (ctx.odaPerformed       ? 0x00 : 0x80) |  // bit 8: ODA not performed
      (ctx.odaFailed          ? 0x40 : 0x00) |  // bit 7: SDA failed
      (ctx.iccDataMissing     ? 0x20 : 0x00) |  // bit 6: ICC data missing
      (ctx.cardOnExceptionFile ? 0x10 : 0x00) | // bit 5: Card on exception file
      (ctx.ddaFailed          ? 0x08 : 0x00) |  // bit 4: DDA failed
      (ctx.cdaFailed          ? 0x04 : 0x00) |  // bit 3: CDA failed
      (ctx.sdaSelected        ? 0x02 : 0x00);   // bit 2: SDA selected

    const b2 =
      (ctx.cardNotEffective   ? 0x80 : 0x00) |
      (ctx.appExpired         ? 0x40 : 0x00) |
      (ctx.appNotEffective    ? 0x20 : 0x00) |
      (ctx.newCard            ? 0x08 : 0x00) |
      (ctx.cvmFailed          ? 0x04 : 0x00) |
      (ctx.unrecognisedCVM    ? 0x02 : 0x00) |
      (ctx.pinTryLimitExceeded ? 0x01 : 0x00);

    const b3 =
      (ctx.pinPadMissingOrBroken      ? 0x80 : 0x00) |
      (ctx.pinRequiredNotEntered      ? 0x40 : 0x00) |
      (ctx.onlinePinEntered           ? 0x20 : 0x00) |
      (ctx.exceedsFloorLimit          ? 0x10 : 0x00) |
      (ctx.lowerOfflineLimitExceeded  ? 0x08 : 0x00) |
      (ctx.upperOfflineLimitExceeded  ? 0x04 : 0x00) |
      (ctx.randomOnlineSelected       ? 0x02 : 0x00) |
      (ctx.merchantForcedOnline       ? 0x01 : 0x00);

    const b4 =
      (ctx.defaultTDOLUsed            ? 0x80 : 0x00) |
      (ctx.issuerAuthFailed           ? 0x40 : 0x00) |
      (ctx.scriptFailedBeforeFinalAC  ? 0x20 : 0x00) |
      (ctx.scriptFailedAfterFinalAC   ? 0x10 : 0x00);

    const b5 = 0x00; // RFU

    return [b1, b2, b3, b4, b5]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  /**
   * Build 2-byte TSI (4 hex chars) per EMV Book 3 §6.6
   *
   * Byte 1 (bits 8→1): ODA performed · CVM performed · Card risk mgmt performed ·
   *                      Issuer auth performed · Script processing performed ·
   *                      RFU×3
   * Byte 2: RFU (always 0x00)
   */
  static buildTSI(ctx: TSIContext): string {
    let b1 = 0x00;
    const b2 = 0x00;

    if (ctx.offlineDataAuthenticationPerformed) b1 |= 0x80; // bit 8
    if (ctx.cardholderVerificationPerformed)   b1 |= 0x40; // bit 7
    if (ctx.cardRiskManagementPerformed)       b1 |= 0x20; // bit 6
    if (ctx.issuerAuthPerformed)              b1 |= 0x10; // bit 5
    if (ctx.scriptProcessingPerformed)         b1 |= 0x08; // bit 4

    return [b1, b2]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }
}
