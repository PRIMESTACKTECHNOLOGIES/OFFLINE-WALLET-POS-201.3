import { Router } from "express";
import { paymentsController } from "./payments.controller";
import { authenticateToken } from "../../middleware/auth.middleware";

const router = Router();

// ─── ACR122U card read for contactless/contact reader ─────────────────────────
router.post("/read-acr122u", paymentsController.readAcr122uCard.bind(paymentsController));
router.get("/read-acr122u/status", paymentsController.getAcr122uStatus.bind(paymentsController));
router.get("/status", paymentsController.getAcr122uStatus.bind(paymentsController));
// Backward-compatible aliases for older callers
router.post("/payments/read-acr122u", paymentsController.readAcr122uCard.bind(paymentsController));
router.get("/payments/read-acr122u/status", paymentsController.getAcr122uStatus.bind(paymentsController));
router.post("/payments/decide", paymentsController.decide.bind(paymentsController));
router.post("/payments/charge", paymentsController.charge.bind(paymentsController));
router.post("/settlements/capture", authenticateToken, paymentsController.captureSettlement.bind(paymentsController));
// Module-9 / offline PIN upload endpoint (POS devices)
router.post("/offline-pin", paymentsController.handleOfflinePinSale.bind(paymentsController));
// Backward compatible alias
router.post("/payments/offline-pin", paymentsController.handleOfflinePinSale.bind(paymentsController));

export { router as paymentsRouter };
