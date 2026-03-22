import { Request, Response } from "express";
import { terminalsService } from "./terminals.service";

export class TerminalsController {
  async register(req: Request, res: Response) {
    const { terminalName } = req.body;
    if (!terminalName) {
      return res.status(400).json({ error: "terminalName required" });
    }

    try {
      const result = await terminalsService.registerTerminal(terminalName);
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async verify(req: Request, res: Response) {
    const { merchantId, terminalId, secretKey } = req.body;
    
    console.log("[Terminal Verify] Request received:", { merchantId, terminalId, secretKey: secretKey ? "***" : "missing" });
    
    if (!merchantId || !terminalId || !secretKey) {
      console.log("[Terminal Verify] Missing fields:", { merchantId: !!merchantId, terminalId: !!terminalId, secretKey: !!secretKey });
      return res.status(400).json({ 
        valid: false, 
        error: "merchantId, terminalId, and secretKey are required" 
      });
    }

    try {
      const result = await terminalsService.verifyTerminal(merchantId, terminalId, secretKey);
      console.log("[Terminal Verify] Result:", result);
      res.json(result);
    } catch (error) {
      console.error("[Terminal Verify] Error:", error);
      res.status(500).json({ valid: false, error: "Internal Server Error" });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const data = await terminalsService.getTerminals();
      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
}

export const terminalsController = new TerminalsController();
