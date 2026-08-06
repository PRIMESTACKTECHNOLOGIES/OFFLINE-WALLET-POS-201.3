import { Router } from "express";
import { paymentReceiverController } from "./paymentreceiver.controller";

const router = Router();

router.post("/", paymentReceiverController.receive);
router.get("/", paymentReceiverController.list);

export { router as paymentReceiverRouter };
