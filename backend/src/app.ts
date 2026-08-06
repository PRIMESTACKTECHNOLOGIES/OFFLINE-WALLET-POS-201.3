import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import { authenticateToken } from "./middleware/auth.middleware";
import { terminalsRouter } from "./domain/terminals/terminals.router";
import { transactionsRouter } from "./domain/transactions/transactions.router";
import { productsRouter } from "./domain/products/products.router";
import { authRouter } from "./domain/auth/auth.router";
import { settingsRouter } from "./domain/settings/settings.router";
import { batchesRouter } from "./domain/batches/batches.router";
import { batchesController } from "./domain/batches/batches.controller";
import { terminalsController } from "./domain/terminals/terminals.controller";
import { paymentsRouter } from "./domain/payments/payments.router";
import { receiptsRouter } from "./domain/receipts/receipts.router";
import { walletsRouter } from "./domain/wallets/wallets.router";
import apiRouter from "./domain/api/api.router";
import payoutBankRouter from './domain/payouts/bank.router';
import payoutCryptoRouter from './domain/payouts/crypto.router';
import settlementsRouter from './domain/settlements/settlements.router';
import { wiseWebhookRouter } from './domain/payouts/wiseWebhook.router';
import { cashoutsRouter } from "./domain/cashouts/cashouts.router";
import { paymentReceiverRouter } from "./domain/paymentreceiver/paymentreceiver.router";

export const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS: origin not allowed"), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Signature", "X-Merchant-Id", "X-Terminal-Id"]
}));
app.options("*", cors());

// ── Simple in-memory rate limiter (no extra dependencies) ─────────────────────
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (entry && now < entry.resetAt) {
    if (entry.count >= 10) {
      return res.status(429).json({
        error: "Too many login attempts. Try again in 15 minutes."
      });
    }
    entry.count++;
  } else {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  }
  next();
}

// ── Body parser ───────────────────────────────────────────────────────────────
// Payment webhook and processor endpoints may require raw body handling for specific routes
app.use("/merchant/v1/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10mb" }));

// ── Public routes ─────────────────────────────────────────────────────────────
app.use("/auth/login", loginRateLimiter);
app.use("/auth", authRouter);

// ── Health checks (public) ────────────────────────────────────────────────────
app.get("/", (_req, res) => res.send("POS 201.3 Backend Running"));
app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// ── Terminal verify test endpoint (public, GET only) ──────────────────────────
app.get("/merchant/v1/terminal/verify", (_req, res) => {
  res.json({ status: "ok", message: "Use POST to verify credentials." });
});
app.get("/merchant/v1", (_req, res) => {
  res.json({ status: "ok", message: "Merchant API v1" });
});

// ── Public terminal register/verify (Android POS app — no JWT needed) ────────
app.post("/merchant/v1/terminal/register", terminalsController.register.bind(terminalsController));
app.post("/merchant/v1/terminal/verify", terminalsController.verify.bind(terminalsController));

// ── Android POS offline-sale alias (maps to batch upload) ────────────────────
app.post("/api/pos/offline-sale", batchesController.processOfflineBatch.bind(batchesController));
app.post("/api/payment2013/redeem", batchesController.redeemPaymentCode.bind(batchesController));

// ── POS standalone batch upload and settlement endpoints (public, HMAC-protected)
app.post("/merchant/v1/api/payment2013/batch", batchesController.processOfflineBatch.bind(batchesController));
app.post("/merchant/v1/pos/201.3/offline-batch", batchesController.processOfflineBatch.bind(batchesController));
app.post("/merchant/v1/api/payment2013/redeem", batchesController.redeemPaymentCode.bind(batchesController));
app.post("/merchant/v1/pos/201.3/redeem", batchesController.redeemPaymentCode.bind(batchesController));
app.post("/merchant/v1/api/payment2013/verify", batchesController.verifyCredentials.bind(batchesController));

// ── Payment router with card reader and processor endpoints ───────────────
app.use("/merchant/v1/payments", paymentsRouter);

// ── Public webhook endpoint for Wise payout notifications
app.use('/webhooks', wiseWebhookRouter);

// ══ ALL ROUTES BELOW REQUIRE AUTHENTICATION ══════════════════════════════════
app.use(authenticateToken);

// Wallet routes
app.use("/wallet", walletsRouter);

// API routes (contract)
app.use('/api', apiRouter);
app.use('/api', payoutBankRouter);
app.use('/api', payoutCryptoRouter);
app.use('/api', settlementsRouter);

// Merchant API routes
app.use("/merchant/v1", terminalsRouter);
app.use("/merchant/v1", transactionsRouter);
app.use("/merchant/v1", productsRouter);
app.use("/merchant/v1", settingsRouter);
app.use("/merchant/v1", batchesRouter);
app.use("/merchant/v1/receipts", receiptsRouter);
app.use("/merchant/v1/cashouts", cashoutsRouter);
// Internal payment receiver for standalone testing and internal integrations
app.use("/internal/payment-receiver", paymentReceiverRouter);

// ── Serve React frontend (production) ────────────────────────────────────────
const clientBuildPath = path.join(__dirname, "public");
app.use(express.static(clientBuildPath));
// SPA fallback — any route not matched by the API returns index.html
app.get("*", (_req, res) => {
  const indexPath = path.join(clientBuildPath, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).json({ status: "ok", message: "POS 201.3 API running" });
    }
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Error]", err.message || err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});
