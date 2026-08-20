import { db } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';

export interface PaymentParty {
  name: string;
  iban?: string;
  accountId?: string;
  bic?: string;
  clearingMemberId?: string;
  country?: string;
  city?: string;
  addressLine?: string;
}

export interface Pain001Request {
  settlementIds: string[];
  debtor: PaymentParty;
  creditor: PaymentParty;
  requestedExecutionDate?: string;
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function accountXml(party: PaymentParty, tag: 'DbtrAcct' | 'CdtrAcct'): string {
  if (party.iban) return `<${tag}><Id><IBAN>${escapeXml(party.iban)}</IBAN></Id></${tag}>`;
  if (party.accountId) return `<${tag}><Id><Othr><Id>${escapeXml(party.accountId)}</Id></Othr></Id></${tag}>`;
  throw new Error(`${tag} requires iban or accountId`);
}

function agentXml(party: PaymentParty, tag: 'DbtrAgt' | 'CdtrAgt'): string {
  if (party.bic) return `<${tag}><FinInstnId><BIC>${escapeXml(party.bic)}</BIC></FinInstnId></${tag}>`;
  if (party.clearingMemberId) {
    return `<${tag}><FinInstnId><ClrSysMmbId><MmbId>${escapeXml(party.clearingMemberId)}</MmbId></ClrSysMmbId></FinInstnId></${tag}>`;
  }
  throw new Error(`${tag} requires bic or clearingMemberId`);
}

function partyXml(party: PaymentParty, tag: 'Dbtr' | 'Cdtr'): string {
  const address = party.country || party.city || party.addressLine
    ? `<PstlAdr>${party.country ? `<Ctry>${escapeXml(party.country)}</Ctry>` : ''}${party.city ? `<TwnNm>${escapeXml(party.city)}</TwnNm>` : ''}${party.addressLine ? `<AdrLine>${escapeXml(party.addressLine)}</AdrLine>` : ''}</PstlAdr>`
    : '';
  return `<${tag}><Nm>${escapeXml(party.name)}</Nm>${address}</${tag}>`;
}

function validateParty(party: PaymentParty, label: string) {
  if (!party || !party.name.trim()) throw new Error(`${label}.name is required`);
  if (!party.iban && !party.accountId) throw new Error(`${label}.iban or ${label}.accountId is required`);
  if (!party.bic && !party.clearingMemberId) throw new Error(`${label}.bic or ${label}.clearingMemberId is required`);
}

export async function generatePain001(merchantId: string, request: Pain001Request) {
  if (!merchantId) throw new Error('merchantId is required');
  if (!Array.isArray(request.settlementIds) || request.settlementIds.length === 0) {
    throw new Error('settlementIds must contain at least one settlement');
  }
  validateParty(request.debtor, 'debtor');
  validateParty(request.creditor, 'creditor');

  const uniqueIds = [...new Set(request.settlementIds.map(id => String(id).trim()).filter(Boolean))];
  if (uniqueIds.length !== request.settlementIds.length) throw new Error('settlementIds must be unique and non-empty');

  const placeholders = uniqueIds.map(() => '?').join(',');
  const result = await db.query(
    `SELECT id, amount, currency, meta FROM merchant_pos_settlements
     WHERE merchant_id = ? AND id IN (${placeholders}) AND status = 'unsettled'
     ORDER BY created_at ASC`,
    [merchantId, ...uniqueIds]
  );
  if (result.rows.length !== uniqueIds.length) {
    const found = new Set(result.rows.map((row: any) => row.id));
    const missing = uniqueIds.filter(id => !found.has(id));
    throw new Error(`Only unsettled merchant settlements can be exported; unavailable: ${missing.join(', ')}`);
  }

  const currencies = [...new Set(result.rows.map((row: any) => String(row.currency || '').toUpperCase()))];
  if (currencies.length !== 1 || !currencies[0]) throw new Error('All selected settlements must use one valid currency');
  const currency = currencies[0];
  const total = result.rows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Selected settlements have no payable amount');

  const now = new Date();
  const messageId = `POS2013-${uuidv4().replace(/-/g, '').slice(0, 24).toUpperCase()}`;
  const paymentInfoId = `${merchantId}-${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
  const executionDate = request.requestedExecutionDate || now.toISOString().slice(0, 10);
  const transactions = result.rows.map((row: any) => {
    const meta = row.meta ? (typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta) : {};
    const endToEndId = String(meta.local_txn_id || meta.stan || row.id).slice(0, 35);
    return `<CdtTrfTxInf><PmtId><EndToEndId>${escapeXml(endToEndId)}</EndToEndId></PmtId><Amt><InstdAmt Ccy="${escapeXml(currency)}">${Number(row.amount).toFixed(2)}</InstdAmt></Amt>${agentXml(request.creditor, 'CdtrAgt')}${partyXml(request.creditor, 'Cdtr')}${accountXml(request.creditor, 'CdtrAcct')}<RmtInf><Ustrd>POS 201.3 settlement ${escapeXml(row.id)}</Ustrd></RmtInf></CdtTrfTxInf>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.13"><CstmrCdtTrfInitn><GrpHdr><MsgId>${escapeXml(messageId)}</MsgId><CreDtTm>${now.toISOString()}</CreDtTm><NbOfTxs>${result.rows.length}</NbOfTxs><CtrlSum>${total.toFixed(2)}</CtrlSum><InitgPty><Nm>${escapeXml(request.debtor.name)}</Nm></InitgPty></GrpHdr><PmtInf><PmtInfId>${escapeXml(paymentInfoId)}</PmtInfId><PmtMtd>TRF</PmtMtd><NbOfTxs>${result.rows.length}</NbOfTxs><CtrlSum>${total.toFixed(2)}</CtrlSum><ReqdExctnDt><Dt>${escapeXml(executionDate)}</Dt></ReqdExctnDt>${partyXml(request.debtor, 'Dbtr')}${accountXml(request.debtor, 'DbtrAcct')}${agentXml(request.debtor, 'DbtrAgt')}<ChrgBr>SLEV</ChrgBr>${transactions}</PmtInf></CstmrCdtTrfInitn></Document>`;

  return {
    filename: `${merchantId}_pain001_${now.toISOString().slice(0, 10)}_${messageId}.xml`,
    messageId,
    currency,
    transactionCount: result.rows.length,
    totalAmount: Number(total.toFixed(2)),
    xml,
  };
}