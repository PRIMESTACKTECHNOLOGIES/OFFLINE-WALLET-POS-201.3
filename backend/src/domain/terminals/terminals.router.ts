import { Router } from "express";
import { terminalsController } from "./terminals.controller";

const router = Router();

// GET test endpoint for connectivity check
router.get("/terminal/verify", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Terminal verify endpoint is reachable. Use POST to verify credentials.",
    expectedBodyFormat: {
      merchantId: "<string, e.g. MRC-XXXX>",
      terminalId: "<string, e.g. T2013-XXXX>",
      secretKey: "<terminal secret from TerminalPairing or merchant setup>"
    }
  });
});

router.post("/terminal/register", terminalsController.register.bind(terminalsController));
router.post("/terminal/regenerate-secret", terminalsController.regenerateSecret.bind(terminalsController));
router.post("/terminal/verify", terminalsController.verify.bind(terminalsController));
router.delete("/terminal/:merchantId/:terminalId", terminalsController.delete.bind(terminalsController));
router.get("/terminals", terminalsController.list.bind(terminalsController));

export { router as terminalsRouter };
