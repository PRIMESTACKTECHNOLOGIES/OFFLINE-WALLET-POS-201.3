import { Request, Response } from "express";
import { cashoutsService } from "./cashouts.service";

export class CashoutsController {
  async getCashouts(req: Request, res: Response) {
    try {
      const merchantId = req.headers["x-merchant-id"] as string || "MRC-1001";
      const cashouts = await cashoutsService.getCashouts(merchantId);
      res.json(cashouts);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to get cashouts" });
    }
  }

  async getCashoutById(req: Request, res: Response) {
    try {
      const merchantId = req.headers["x-merchant-id"] as string || "MRC-1001";
      const { id } = req.params;
      const cashout = await cashoutsService.getCashoutById(id, merchantId);
      if (!cashout) {
        return res.status(404).json({ error: "Cashout not found" });
      }
      const transactions = await cashoutsService.getCashoutTransactions(id);
      res.json({ ...cashout, transactions });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to get cashout" });
    }
  }

  async createCashout(req: Request, res: Response) {
    try {
      const merchantId = req.headers["x-merchant-id"] as string || "MRC-1001";
      const { batchIds } = req.body;

      if (!batchIds || batchIds.length === 0) {
        return res.status(400).json({ error: "No batches provided" });
      }

      const result = await cashoutsService.createCashout(merchantId, batchIds);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error(error);
      res.status(400).json({ error: error.message });
    }
  }

  async processCashout(req: Request, res: Response) {
    try {
      const merchantId = req.headers["x-merchant-id"] as string || "MRC-1001";
      const { id } = req.params;
      const cashout = await cashoutsService.processCashout(id, merchantId);
      res.json({ success: true, cashout });
    } catch (error: any) {
      console.error(error);
      res.status(400).json({ error: error.message });
    }
  }
}

export const cashoutsController = new CashoutsController();
