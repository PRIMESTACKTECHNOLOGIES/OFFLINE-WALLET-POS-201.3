/**
 * EMV Card Flow — Full card communication pipeline
 *
 * Orchestrates the complete EMV front-end flow:
 *   1. SELECT PPSE → discover available AIDs
 *   2. SELECT AID  → get FCI (AIP, PDOL, label)
 *   3. GPO         → get AIP + AFL
 *   4. READ RECORD → read all application records from AFL
 *   5. MERGE TLV   → combine SELECT + record data into unified card TLV
 *
 * Output is ready for ODA → Terminal Risk → Card Risk → CVM → AC generation.
 *
 * EMV Book 1 §12 + Book 3 §6.5
 */

import { AIDSelector } from './aid-selector';
import { GPOHandler } from './gpo-handler';
import { RecordReader } from './record-reader';
import { TLVParser } from './tlv-parser';
import type { EMVTag } from './tlv-parser';
import type { CardInterface } from './pos-apdu-bridge';
import type { RecordResult } from './record-reader';

export interface CardFlowResult {
  /** Selected Application Identifier */
  aid: string;
  /** Application label (ASCII) */
  label: string;
  /** Application Interchange Profile — hex */
  aip: string;
  /** Application File Locator — hex */
  afl: string;
  /** Merged TLV from SELECT + all READ RECORD responses — hex */
  tlv: string;
  /** Parsed TLV tags array */
  tags: EMVTag[];
  /** Raw record results from READ RECORD */
  records: RecordResult[];
  /** Full FCI response from SELECT — hex */
  fci: string;
}

export class EMVCardFlow {
  private card: CardInterface;
  private aidSelector: AIDSelector;
  private gpoHandler: GPOHandler;
  private recordReader: RecordReader;

  constructor(card: CardInterface) {
    this.card = card;
    this.aidSelector = new AIDSelector(card);
    this.gpoHandler = new GPOHandler(card);
    this.recordReader = new RecordReader(card);
  }

  /**
   * Execute the full EMV card flow.
   *
   * @param terminalDataHex  Terminal data TLV (hex) — used to fill PDOL fields
   * @param preferredAIDs    Optional list of preferred AIDs (tried after PPSE)
   * @returns                Complete card flow result with merged TLV
   */
  async run(terminalDataHex: string, preferredAIDs?: string[]): Promise<CardFlowResult> {
    // ── Step 1: SELECT PPSE ────────────────────────────────────────────────
    const aids = await this.aidSelector.selectPPSE();

    // ── Step 2: SELECT AID ─────────────────────────────────────────────────
    let selected = null;

    // Try PPSE-discovered AIDs first
    if (aids.length > 0) {
      selected = await this.aidSelector.selectAID(aids[0]);
    }

    // Try preferred AIDs if PPSE failed
    if (!selected && preferredAIDs) {
      for (const aid of preferredAIDs) {
        selected = await this.aidSelector.selectAID(aid);
        if (selected) break;
      }
    }

    // Final fallback: select best available
    if (!selected) {
      selected = await this.aidSelector.selectBestApplication(preferredAIDs);
    }

    if (!selected) {
      throw new Error('NO_AID_FOUND');
    }

    const aid = selected.aid;
    const label = selected.label || '';
    const fci = this.bytesToHex(selected.raw);

    // ── Step 3: GET PROCESSING OPTIONS ─────────────────────────────────────
    const gpo = await this.gpoHandler.process(fci, terminalDataHex);
    const aip = gpo.aip;
    const afl = gpo.afl;

    // ── Step 4: READ RECORD ────────────────────────────────────────────────
    const records = afl.length > 0 ? await this.recordReader.readAFL(afl) : [];

    // ── Step 5: MERGE TLV ──────────────────────────────────────────────────
    const mergedTags: EMVTag[] = [];
    const seenTagIds = new Set<string>();

    // Add SELECT response TLV (FCI)
    const fciTags = TLVParser.parseTLV(fci);
    for (const tag of fciTags) {
      if (!seenTagIds.has(tag.tag)) {
        mergedTags.push(tag);
        seenTagIds.add(tag.tag);
      }
    }

    // Add READ RECORD TLVs (deduplicated)
    for (const record of records) {
      for (const tag of record.tlv) {
        if (!seenTagIds.has(tag.tag)) {
          mergedTags.push(tag);
          seenTagIds.add(tag.tag);
        }
      }
    }

    // Build merged TLV hex string
    const tlvHex = mergedTags.map(t => {
      const tagHex = t.tag;
      const valueLen = t.value.length / 2;
      const lenHex = valueLen.toString(16).padStart(2, '0');
      return tagHex + lenHex + t.value;
    }).join('');

    return {
      aid,
      label,
      aip,
      afl,
      tlv: tlvHex,
      tags: mergedTags,
      records,
      fci
    };
  }

  /**
   * Run flow with a specific AID (skip PPSE discovery).
   *
   * @param aidHex           AID to select directly
   * @param terminalDataHex  Terminal data TLV (hex)
   */
  async runWithAID(aidHex: string, terminalDataHex: string): Promise<CardFlowResult> {
    const selected = await this.aidSelector.selectAID(aidHex);
    if (!selected) {
      throw new Error('AID_SELECT_FAILED');
    }

    const fci = this.bytesToHex(selected.raw);
    const gpo = await this.gpoHandler.process(fci, terminalDataHex);
    const records = gpo.afl.length > 0 ? await this.recordReader.readAFL(gpo.afl) : [];

    const mergedTags = RecordReader.mergeRecordTags(
      TLVParser.parseTLV(fci),
      records
    );

    const tlvHex = mergedTags.map(t => {
      const valueLen = t.value.length / 2;
      const lenHex = valueLen.toString(16).padStart(2, '0');
      return t.tag + lenHex + t.value;
    }).join('');

    return {
      aid: selected.aid,
      label: selected.label || '',
      aip: gpo.aip,
      afl: gpo.afl,
      tlv: tlvHex,
      tags: mergedTags,
      records,
      fci
    };
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }
}
