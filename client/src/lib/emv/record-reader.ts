/**
 * Record Reader — AFL / READ RECORD APDU + TLV Extraction
 *
 * Implements the EMV SELECT → GPO → READ RECORD pipeline:
 *   1. Parse AFL (Application File Locator) from GPO response (tag 94)
 *   2. Build READ RECORD APDUs for each SFI/record range
 *   3. Transmit APDUs via CardInterface (ICC or NFC)
 *   4. Parse TLV from each record response
 *   5. Return structured RecordResult[] for merging into card data
 *
 * EMV Book 1 §11.2 — READ RECORD
 * EMV Book 3 §6.5.8 — GPO returns AFL in tag 94 or 80
 *
 * AFL format (tag 94): 4 bytes per entry:
 *   Byte 1: SFI (upper 5 bits) + 000 (lower 3 bits)
 *   Byte 2: First record number
 *   Byte 3: Last record number
 *   Byte 4: Number of records for offline data authentication
 */

import { TLVParser } from './tlv-parser';
import type { EMVTag } from './tlv-parser';
import type { CardInterface } from './pos-apdu-bridge';

export interface RecordResult {
  /** Short File Identifier (1–30) */
  sfi: number;
  /** Record number within the SFI */
  record: number;
  /** Raw response bytes from READ RECORD */
  raw: Uint8Array;
  /** Parsed TLV tags from the record */
  tlv: EMVTag[];
  /** Number of records for offline data authentication (from AFL byte 4) */
  odaRecords: number;
}

export interface AFL {
  /** Parsed AFL entries */
  entries: AFLEntry[];
  /** Raw AFL hex */
  raw: string;
}

export interface AFLEntry {
  /** Short File Identifier (1–30) */
  sfi: number;
  /** First record to read */
  firstRecord: number;
  /** Last record to read */
  lastRecord: number;
  /** Number of records for offline data authentication */
  odaRecords: number;
}

export class RecordReader {
  private card: CardInterface;

  constructor(card: CardInterface) {
    this.card = card;
  }

  /**
   * Parse AFL hex string into structured entries.
   *
   * @param aflHex  AFL data as hex (from tag 94 or tag 80 format 2)
   * @returns       Parsed AFL structure
   */
  parseAFL(aflHex: string): AFL {
    const aflBytes = this.hexToBytes(aflHex);
    const entries: AFLEntry[] = [];

    // AFL is 4 bytes per entry
    for (let i = 0; i + 3 < aflBytes.length; i += 4) {
      const sfiByte = aflBytes[i];
      const sfi = sfiByte >> 3; // Upper 5 bits = SFI
      const firstRecord = aflBytes[i + 1];
      const lastRecord = aflBytes[i + 2];
      const odaRecords = aflBytes[i + 3];

      if (sfi > 0 && sfi <= 30 && firstRecord > 0 && lastRecord >= firstRecord) {
        entries.push({ sfi, firstRecord, lastRecord, odaRecords });
      }
    }

    return { entries, raw: aflHex };
  }

  /**
   * Read all records specified by the AFL.
   *
   * Iterates through each AFL entry and reads every record
   * from firstRecord to lastRecord using READ RECORD APDUs.
   *
   * @param aflHex  AFL data as hex (tag 94 or extracted from tag 80)
   * @returns       Array of successfully read records with parsed TLV
   */
  async readAFL(aflHex: string): Promise<RecordResult[]> {
    const afl = this.parseAFL(aflHex);
    const results: RecordResult[] = [];

    for (const entry of afl.entries) {
      for (let rec = entry.firstRecord; rec <= entry.lastRecord; rec++) {
        try {
          const result = await this.readRecord(entry.sfi, rec, entry.odaRecords);
          if (result) {
            results.push(result);
          }
        } catch {
          // Record read failed — continue with next record
          // (card may not have all records in range)
        }
      }
    }

    return results;
  }

  /**
   * Read a single record from a specific SFI.
   *
   * Builds and transmits a READ RECORD APDU:
   *   CLA=00 INS=B2 P1=record P2=(SFI<<3)|04 Le=00
   *
   * @param sfi          Short File Identifier (1–30)
   * @param recordNum    Record number to read
   * @param odaRecords   Number of records for offline auth (from AFL)
   * @returns            Parsed record result, or null on failure
   */
  async readRecord(
    sfi: number,
    recordNum: number,
    odaRecords = 0
  ): Promise<RecordResult | null> {
    const apdu = this.buildReadRecordAPDU(recordNum, sfi);
    const resp = await this.card.transmit(apdu);

    if (resp.sw1 !== 0x90 || resp.sw2 !== 0x00) {
      return null;
    }

    const dataHex = this.bytesToHex(resp.data);
    const tlv = dataHex.length > 0 ? TLVParser.parseTLV(dataHex) : [];

    return {
      sfi,
      record: recordNum,
      raw: resp.data,
      tlv,
      odaRecords
    };
  }

  /**
   * Merge record TLV tags into an existing tag array.
   *
   * Useful after readAFL() to enrich card data with
   * all application data from READ RECORD responses.
   *
   * @param existingTags  Current card TLV tags
   * @param records       Record results from readAFL()
   * @returns             Merged tag array (deduplicated by tag ID)
   */
  static mergeRecordTags(existingTags: EMVTag[], records: RecordResult[]): EMVTag[] {
    const merged = [...existingTags];
    const existingIds = new Set(existingTags.map(t => t.tag));

    for (const record of records) {
      for (const tag of record.tlv) {
        if (!existingIds.has(tag.tag)) {
          merged.push(tag);
          existingIds.add(tag.tag);
        }
      }
    }

    return merged;
  }

  /**
   * Extract AFL from GPO response.
   *
   * GPO response can be in two formats:
   *   Format 1 (tag 80): Response message template format 1
   *     - AIP (2 bytes) + AFL (variable)
   *   Format 2 (tag 77): Response message template format 2
   *     - Contains tag 82 (AIP) and tag 94 (AFL) as nested TLV
   *
   * @param gpoResponse  GPO response data as hex
   * @returns            AFL hex string, or null if not found
   */
  static extractAFLFromGPO(gpoResponse: string): string | null {
    const tags = TLVParser.parseTLV(gpoResponse);

    // Format 2: tag 94 contains AFL directly
    const afl = TLVParser.getTagValue(tags, '94');
    if (afl) return afl;

    // Format 1: tag 80 contains AIP (2 bytes) + AFL (rest)
    const fmt1 = TLVParser.getTagValue(tags, '80');
    if (fmt1 && fmt1.length > 4) {
      // Skip first 4 hex chars (2 bytes AIP), rest is AFL
      return fmt1.substring(4);
    }

    return null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private buildReadRecordAPDU(record: number, sfi: number): Uint8Array {
    // READ RECORD: CLA=00 INS=B2 P1=record P2=(SFI<<3)|04 Le=00
    return new Uint8Array([
      0x00,                    // CLA
      0xB2,                    // INS = READ RECORD
      record,                  // P1 = record number
      (sfi << 3) | 0x04,      // P2 = SFI in upper 5 bits, lower 3 = 100 (by SFI)
      0x00                     // Le = max response
    ]);
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
