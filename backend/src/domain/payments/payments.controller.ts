import { Request, Response } from "express";
import { paymentsService } from "./payments.service";
import { walletsService } from "../wallets/wallets.service";
import { getWsServer } from "../../realtime/wsServer";
import { acr122uReaderService } from "./acr122u-reader";
import { parseTlv, extractEmvData } from "./emv-tlv-parser";
import { recordOfflinePosTransaction } from './offline-sync.service';
import { performOda } from "../../utils/emvOda";
import { posDecisionService } from "./pos-decision.service";
import { settleCardTransaction } from "./realSettlement.service";

export class PaymentsController {

  async charge(req: Request, res: Response) {
    try {
      const { amountMinor, currency, merchantId, pan, expiry, cvv, emv, terminalId, tlvRaw, stan, customerId } = req.body || {};

      if (!amountMinor || !currency) {
        return res.status(400).json({ error: "amountMinor and currency required" });
      }

      if (!merchantId) {
        return res.status(400).json({ error: "merchantId required" });
      }

      if (pan && pan.length < 12) {
        return res.status(400).json({ error: "Invalid PAN" });
      }

      if (expiry && !/^\d{2}\/\d{2}$/.test(expiry)) {
        return res.status(400).json({ error: "Invalid expiry format MM/YY" });
      }

      console.log("Charge request:", req.body);

      let normalizedEmv = emv;
      if (!normalizedEmv && tlvRaw && typeof tlvRaw === "string") {
        try {
          const rawBuffer = Buffer.from(tlvRaw, "hex");
          const parsedTlv = parseTlv(rawBuffer);
          normalizedEmv = extractEmvData(parsedTlv, tlvRaw);
        } catch {
          normalizedEmv = { field55: tlvRaw };
        }
      }

      const result = await paymentsService.charge(merchantId, {
        amountMinor,
        currency,
        pan,
        expiry,
        cvv,
        emv: normalizedEmv,
        terminalId,
        merchantId,
        stan,
        customerId,
      });

      if (result?.status === "APPROVED" && customerId) {
        try {
          const wallet = await walletsService.getOrCreateWallet(customerId);
          const io = getWsServer();
          io.to(customerId).emit("wallet.refresh", {
            customerId,
            walletId: wallet.id,
            balanceChanged: true,
          });
        } catch (err) {
          console.warn("[WS] Failed to emit wallet.refresh", err);
        }
      }

      res.json(result);

    } catch (e: any) {
      res.status(500).json({
        error: e.message,
        code: "PROCESSOR_ERROR"
      });
    }
  }

  async decide(req: Request, res: Response) {
    try {
      const { merchantId, terminalId, amountMinor, currency, card, emv, oda, tlvRaw } = req.body || {};

      if (!merchantId || !terminalId || !amountMinor || !currency) {
        return res.status(400).json({ error: "merchantId, terminalId, amountMinor and currency are required" });
      }

      let decisionEmv = emv;
      if (!decisionEmv && tlvRaw && typeof tlvRaw === 'string') {
        try {
          const rawBuffer = Buffer.from(tlvRaw, 'hex');
          const parsedTlv = parseTlv(rawBuffer);
          decisionEmv = extractEmvData(parsedTlv);
        } catch {
          decisionEmv = undefined;
        }
      }

      const result = await posDecisionService.decide({
        merchantId,
        terminalId,
        amountMinor,
        currency,
        card,
        emv: decisionEmv,
        oda,
      });

      return res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Unable to decide POS outcome" });
    }
  }

  async readAcr122uCard(req: Request, res: Response) {
    try {
      if (!acr122uReaderService.isEnabled()) {
        return res.status(503).json({
          success: false,
          error: "ACR122U reader unavailable."
        });
      }

      const card = await acr122uReaderService.readCard();
      if (!card) {
        return res.status(404).json({
          success: false,
          error: "No card detected."
        });
      }

      // If the reader returns raw EMV data, parse it
      let emv: Record<string, any> | null = null;
      let tlvRaw: string | null = null;

      if ((card as any).raw && Buffer.isBuffer((card as any).raw)) {
        const rawBuffer = (card as any).raw as Buffer;
        tlvRaw = rawBuffer.toString('hex').toUpperCase();
        const tlv = parseTlv(rawBuffer);
        emv = extractEmvData(tlv);
        const oda = await performOda(tlv);
        return res.json({ success: true, card, emv, oda, tlvRaw });
      }

      res.json({ success: true, card, emv, tlvRaw });

    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || "Reader unavailable"
      });
    }
  }

  async getAcr122uStatus(req: Request, res: Response) {
    try {
      const status = await acr122uReaderService.getStatus();
      res.json({ success: true, enabled: status.enabled, connected: status.connected });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        enabled: false,
        error: error.message || "Unable to determine NFC status"
      });
    }
  }

  async captureSettlement(req: Request, res: Response) {
    try {
      const { merchantId, amount, authRef } = req.body || {};

      if (!merchantId || !amount || !authRef) {
        return res.status(400).json({ error: "merchantId, amount and authRef are required" });
      }

      const settled = await settleCardTransaction(merchantId, Number(amount), authRef);
      return res.json(settled);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Unable to settle transaction" });
    }
  }

  /**
   * Accept a Module-9 / offline PIN approved sale from a POS device and persist
   * it into the offline transaction tables so it participates in reconciliation.
   * Public HMAC or token protection should be applied by the caller (app.ts mounts
   * batch endpoints with HMAC semantics). This endpoint expects a JSON body with
   * required: merchantId, amountMinor, currency, panMasked
   * optional: terminalId, stan, rrn, authCode, emvData, tlvRaw, cvmResult, pinVerified
   */
  async handleOfflinePinSale(req: Request, res: Response) {
    try {
      const body = req.body || {};
      const merchantId = body.merchantId || body.merchant_id;
      if (!merchantId) return res.status(400).json({ error: 'merchantId required' });

      const amountMinor = Number(body.amountMinor ?? body.amount);
      if (!amountMinor || amountMinor <= 0) return res.status(400).json({ error: 'amountMinor required and must be positive' });

      const params = {
        merchantId,
        terminalId: body.terminalId || body.terminal_id || undefined,
        amountMinor,
        currency: (body.currency || 'USD'),
        panMasked: body.panMasked || body.card_masked || undefined,
        txnType: body.txnType || 'SALE',
        authMode: body.authMode || 'OFFLINE_APPROVED',
        entryMode: body.entryMode || 'CHIP',
        cardBrand: body.cardBrand || undefined,
        readerSource: body.readerSource || undefined,
        cvmResult: body.cvmResult || body.cvm_result || undefined,
        pinVerified: body.pinVerified === true || body.pin_verified === 1 || false,
        rrn: body.rrn || undefined,
        stan: body.stan || undefined,
        authCode: body.authCode || body.auth_code || undefined,
        emvData: body.emv || body.emvData || body.emv_data || undefined,
        tlvRaw: body.tlvRaw || body.tlv_raw || undefined,
        ledgerEntryId: body.ledgerEntryId || undefined,
        localTxnId: body.localTxnId || body.local_txn_id || undefined,
      } as any;

      const result = await recordOfflinePosTransaction(params);

      return res.json(result);
    } catch (err: any) {
      console.error('handleOfflinePinSale error', err);
      return res.status(500).json({ error: err?.message || String(err) });
    }
  }
}

export const paymentsController = new PaymentsController();
