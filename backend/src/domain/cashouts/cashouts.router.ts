import { Router } from "express";
import { cashoutsController } from "./cashouts.controller";

const router = Router();

// Get all cashouts
router.get("/", (req, res) => cashoutsController.getCashouts(req, res));

// Get cashout by ID
router.get("/:id", (req, res) => cashoutsController.getCashoutById(req, res));

// Create cashout
router.post("/", (req, res) => cashoutsController.createCashout(req, res));

// Process cashout
router.post("/:id/process", (req, res) => cashoutsController.processCashout(req, res));

export { router as cashoutsRouter };
