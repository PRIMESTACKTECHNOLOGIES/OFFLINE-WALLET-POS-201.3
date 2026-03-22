import { Router } from "express";
import { paymentsController } from "./payments.controller";
import { authenticateToken } from "../../middleware/auth.middleware";

const router = Router();

router.post("/payments/charge", authenticateToken, paymentsController.charge.bind(paymentsController));

export { router as paymentsRouter };
