import { Request, Response } from "express";
import { receiptsService } from "./receipts.service";
import { thermalReceiptService } from "./thermalReceipt.service";

export class ReceiptsController {
  /**
   * Generate a new thermal receipt for a transaction (both CUSTOMER + MERCHANT copies)
   */
  async generate(req: Request, res: Response) {
    try {
      const { transactionId } = req.params;
      const merchantId = (req.headers["x-merchant-id"] as string) || "MRC-1001";

      const receipt = await receiptsService.generateReceipt(transactionId, merchantId);
      res.json({ success: true, receipt });
    } catch (e: any) {
      console.error("Error generating receipt:", e);
      res.status(400).json({ success: false, error: e.message });
    }
  }

  /**
   * Get all receipts for merchant
   */
  async list(req: Request, res: Response) {
    try {
      const merchantId = (req.headers["x-merchant-id"] as string) || "MRC-1001";
      const limit = parseInt(req.query.limit as string) || 50;

      const receipts = await receiptsService.getReceipts(merchantId, limit);
      res.json({ success: true, receipts });
    } catch (e: any) {
      console.error("Error fetching receipts:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  }

  /**
   * Get single receipt by ID
   */
  async getById(req: Request, res: Response) {
    try {
      const { receiptId } = req.params;
      const merchantId = (req.headers["x-merchant-id"] as string) || "MRC-1001";

      const receipt = await receiptsService.getReceiptById(receiptId, merchantId);

      if (!receipt) {
        return res.status(404).json({ success: false, error: "Receipt not found" });
      }

      res.json({ success: true, receipt });
    } catch (e: any) {
      console.error("Error fetching receipt:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  }

  /**
   * Print receipt — returns the 80mm thermal format (both copies + individual)
   */
  async print(req: Request, res: Response) {
    try {
      const { receiptId } = req.params;
      const merchantId = (req.headers["x-merchant-id"] as string) || "MRC-1001";

      const result = await receiptsService.printReceipt(receiptId, merchantId);
      res.json({ success: true, ...result });
    } catch (e: any) {
      console.error("Error printing receipt:", e);
      res.status(400).json({ success: false, error: e.message });
    }
  }

  /**
   * Generate thermal receipt directly by transaction ID and download as .txt
   */
  async printThermalByTxn(req: Request, res: Response) {
    try {
      const { transactionId } = req.params;
      const merchantId = (req.headers["x-merchant-id"] as string) || "MRC-1001";
      const copy = (req.query.copy as string) || "combined"; // combined | customer | merchant

      const receipt = await thermalReceiptService.generateForTransaction(transactionId, merchantId);
      if (!receipt) {
        return res.status(404).json({ success: false, error: "Transaction not found" });
      }

      let payload: string;
      let filename: string;
      const id = String((receipt as any).transaction?.id ?? (receipt as any).fullTx?.id ?? (receipt.receiptId || 'txn').replace(/^RCP-/, ''));
      if (copy === "customer") {
        payload = receipt.thermalCustomer;
        filename = `receipt-${id}-CUSTOMER.txt`;
      } else if (copy === "merchant") {
        payload = receipt.thermalMerchant;
        filename = `receipt-${id}-MERCHANT.txt`;
      } else {
        payload = receipt.thermalCombined;
        filename = `receipt-${id}-DUAL.txt`;
      }

      if (req.query.format === "json") {
        return res.json({
          success: true,
          receiptId: receipt.receiptId,
          customerCopy: receipt.thermalCustomer,
          merchantCopy: receipt.thermalMerchant,
          combinedCopy: receipt.thermalCombined,
          plainCustomer: receipt.plainCustomer,
          plainMerchant: receipt.plainMerchant,
          browserCustomer: receipt.browserCustomer,
          browserMerchant: receipt.browserMerchant,
          browserCombined: receipt.browserCombined,
          htmlCustomer: receipt.browserCustomer,
          htmlMerchant: receipt.browserMerchant,
          htmlCombined: receipt.browserCombined,
          thermalCombined: receipt.thermalCombined,
          thermalCustomer: receipt.thermalCustomer,
          thermalMerchant: receipt.thermalMerchant,
          transaction: (receipt as any).fullTx ?? (receipt as any).transaction ?? null
        });
      }

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(payload, "utf8"));
    } catch (e: any) {
      console.error("Error generating thermal receipt:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  }
}

export const receiptsController = new ReceiptsController();
