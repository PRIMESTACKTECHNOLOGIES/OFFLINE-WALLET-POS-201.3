import { Request, Response } from "express";
import { paymentsService } from "./payments.service";

export class PaymentsController {
  async charge(req: Request, res: Response) {
    try {
      const { amountMinor, currency, cardToken, merchantId } = req.body || {};
      if (!amountMinor || !currency) {
        return res.status(400).json({ error: "amountMinor and currency required" });
      }
      const mid = merchantId || "MRC-1001";
      const result = await paymentsService.charge(mid, { amountMinor, currency, cardToken });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Charge failed" });
    }
  }
}

export const paymentsController = new PaymentsController();
