import { Request, Response } from "express";
import { paymentReceiverService } from "./paymentreceiver.service";

export class PaymentReceiverController {
  async receive(req: Request, res: Response) {
    try {
      const payload = req.body || {};
      const result = await paymentReceiverService.receive(payload);
      res.json({ success: true, id: result.id, receivedAt: result.receivedAt });
    } catch (e: any) {
      console.error('PaymentReceiver receive error:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const rows = await paymentReceiverService.list(limit);
      res.json({ success: true, items: rows });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
}

export const paymentReceiverController = new PaymentReceiverController();
