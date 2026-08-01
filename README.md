# POS Offline Software — Current Status

> Last updated: June 2026

---

## What This Software Is

A full **Point-of-Sale (POS) system** with:
- Web-based dashboard (React + Vite frontend)
- Node.js/TypeScript backend
- Android app (Kotlin)
- Full offline EMV card processing engine
- Integrated with **Primestack** payment processor for external payment routing

---

## How to Start

Double-click **`START POS.bat`** in the root folder.

It will:
1. Install dependencies if missing (first run only)
2. Start the backend on `http://localhost:7000`
3. Start the frontend on `http://localhost:7001`
4. Open the browser automatically after 10 seconds

**First run login:**
- Username: `admin`
- Password: set via `ADMIN_PASSWORD` in `backend/.env` (default: `admin123` — change immediately after first login)

> ⚠️ Primestack processor must also be running on `http://localhost:6001` before testing payments.

---

## Architecture Overview

```
Browser (localhost:7001)
    │
    ├── Online payments  ──────────────────► Primestack (localhost:6001)
    │                                              │
    │                                              └──► Configurable payment backend
    │
    ├── Offline payments ─► EMV Engine (browser)
    │                              │
    │                              ├── AES-MAC cryptogram (Web Crypto API)
    │                              ├── Terminal risk management
    │                              ├── Card risk management
    │                              ├── CVM processing (PIN / Signature / No-CVM)
    │                              ├── Action code evaluation (TAC/IAC)
    │                              └── localStorage storage
    │
    └── Sync (when back online) ──────────► Primestack /api/v1/offline/sync

POS Backend (localhost:7000)
    │
    ├── Auth (JWT)
    ├── Terminals management
    ├── Transactions / Batches
    ├── Settings
    └── Receipts

Android App ──────────────────────────────► Primestack (via local IP)
```

---

## Payment Flow

### Online Payment
```
1. POS calls  POST http://localhost:6001/api/v1/charge
   Header:    x-api-key: ps_pub_xxxx
   Body:      { amount, currency }

2. Primestack creates PaymentIntent via configured backend → returns clientSecret

3. POS confirms card payment via clientSecret
   → Payment backend processes the charge
   → Payment dashboard shows: Succeeded ✅
```

### Offline Payment (EMV Engine)
```
1. Card details entered manually
2. EMV engine runs all 11 steps:
   ├── TLV parse (card + terminal data)
   ├── Application selection (Visa / Mastercard / Amex / Discover)
   ├── Offline data authentication (SDA / DDA / CDA)
   ├── Terminal risk management (floor limit, random selection, velocity)
   ├── Card risk management (consecutive offline, cumulative amount, IAC)
   ├── CVM processing (PIN / Signature / No-CVM)
   ├── Action code evaluation (TAC-Denial, IAC-Denial, TAC-Online, IAC-Online)
   ├── Cryptogram generation — REAL AES-MAC via Web Crypto API
   ├── Transaction stored in localStorage (EMV format)
   ├── Queued on Primestack  POST /api/v1/offline/queue
   └── Decision: TC (approved) / AAC (declined) / ARQC (needs online)

3. When internet returns → press Sync Now
   POST http://localhost:6001/api/v1/offline/sync
   → Primestack settles all pending transactions
```

---

## Credentials & Keys

> **Security Warning:** Default bootstrap credentials are for FIRST RUN ONLY. Immediately change all passwords, JWT secrets, API keys, and Primestack credentials via the `/backend/.env` file before any non-localhost deployment. Never commit real secrets to version control.

| Item | Location |
|---|---|
| Merchant admin login | Set via `ADMIN_PASSWORD` in `backend/.env` |
| Primestack public / secret keys | `PS_PUBLIC_KEY` / `PS_SECRET_KEY` in `backend/.env` |
| Primestack admin dashboard | `PRIMESTACK_ADMIN_URL` + `PRIMESTACK_ADMIN_PASSWORD` in `backend/.env` |
| JWT signing secret | `JWT_SECRET` in `backend/.env` (generate with: `openssl rand -hex 32`) |
| Binance live trading keys | `BINANCE_API_KEY` / `BINANCE_API_SECRET` in `backend/.env` |

---

## Ports

| Service | Port |
|---|---|
| POS Frontend | `7001` |
| POS Backend | `7000` |
| Primestack Processor | `6001` |

---

## Project Structure

```
POS OFFLINE SFTWR/
│
├── START POS.bat              ← Double-click to start everything
├── BUILD APK.bat              ← Build Android APK
│
├── backend/                   ← Node.js / TypeScript API
│   ├── src/
│   │   ├── app.ts             ← Express app, all routes
│   │   ├── server.ts          ← Entry point, port 7000
│   │   └── domain/
│   │       ├── auth/          ← JWT login, profile, sessions
│   │       ├── payments/      ← Charge endpoint (→ Primestack)
│   │       ├── primestack/    ← Primestack proxy routes
│   │       ├── batches/       ← Offline batch management
│   │       ├── terminals/     ← Terminal registration
│   │       ├── transactions/  ← Transaction records
│   │       ├── settings/      ← Merchant settings
│   │       └── receipts/      ← Receipt generation
│   ├── .env                   ← Keys and config
│   └── database.sqlite        ← SQLite database
│
├── client/                    ← React + Vite frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── POSPage.tsx        ← Simple POS terminal
│   │   │   ├── POSPageSecure.tsx  ← Full POS with EMV engine
│   │   │   ├── OverviewPage.tsx   ← Dashboard
│   │   │   ├── TransactionsPage.tsx
│   │   │   ├── BatchesPage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   │   └── ...
│   │   └── lib/
│   │       ├── api.ts             ← All API calls
│   │       ├── crypto.ts          ← HMAC signatures
│   │       └── emv/               ← Full EMV offline engine
│   │           ├── emv-engine.ts          ← Orchestrator (11 steps)
│   │           ├── emv-pos-bridge.ts      ← Wires engine to UI
│   │           ├── cryptogram-generator.ts ← Real AES-MAC cryptogram
│   │           ├── terminal-risk-management.ts
│   │           ├── card-risk-management.ts
│   │           ├── cvm-processor.ts
│   │           ├── action-code-processor.ts
│   │           ├── offline-data-authentication.ts
│   │           ├── offline-storage.ts
│   │           ├── tlv-parser.ts
│   │           └── application-selector.ts
│   └── .env.development       ← Frontend env vars
│
└── android_pos_app/           ← Kotlin Android app
    └── app/src/main/
        ├── ui/MainActivity.kt      ← POS UI with keypad
        └── data/api/PosApi.kt      ← Primestack API client
```

---

## EMV Engine Status

| Feature | Status |
|---|---|
| TLV Parser | ✅ Full EMV spec |
| Application Selection | ✅ Visa, Mastercard, Amex, Discover, JCB |
| Offline Data Authentication (SDA/DDA/CDA) | ✅ Structure complete |
| Terminal Risk Management | ✅ Floor limit, random selection, velocity |
| Card Risk Management | ✅ Consecutive/cumulative offline limits, IAC |
| CVM Processing | ✅ PIN, Signature, No-CVM |
| Action Code Evaluation | ✅ TAC/IAC Denial, Online, Default |
| **Offline Cryptogram (TC/AAC/ARQC)** | ✅ **Real AES-MAC via Web Crypto API** |
| Offline Storage | ✅ localStorage, batch export, CSV |
| Offline Batch Mode | ✅ Queue → Sync via Primestack |
| Offline Floor Limits | ✅ Configurable per terminal |
| Connected to POS UI | ✅ Full integration in POSPageSecure |

> **Production Hardening:** PIN verification and RSA certificate chain validation require certified hardware (HSM/P2PE) and real CA public keys from the card schemes. Software POS terminals cannot perform these operations in a PCI-DSS compliant manner without certified hardware peripherals and terminal injection of certified CAPK keys.

---

## Android App

- Package: `com.pos2013.offline`
- Connects to Primestack directly at the backend's IP
- Supports online charge and offline queue
- For **emulator**: uses `http://10.0.2.2:7000/`
- For **real device**: change `BASE_URL` in `PosApi.kt` to your PC's local IP

To build: double-click **`BUILD APK.bat`** (requires Android Studio installed)

---

## Production Hardening Checklist

| Item | Detail |
|---|---|
| PIN verification | Requires PCI-certified hardware PIN pad peripheral; software entry is for development only |
| RSA certificate verification | Requires certified CA public keys (CAPKs) injected per terminal via P2PE secure loader |
| PCI-DSS compliance | Must be formally assessed / SAQ D filled; codebase does not grant compliance |
| Android BASE_URL | Must be updated to PC's IP / real domain for real device testing |
| Virtual card numbers | Issued via Luhn algorithm for internal standalone use — replace with real network-issued PANs via processor |
| Cardholder data storage | Ensure PAN/cvv is never persisted; offline storage holds only cryptograms + masked card data |

---

## What's Next (Recommended)

1. **Connect a payment processor backend** — plug Primestack or any processor to your acquiring bank / card network
2. **Receipt printer integration** — connect to thermal printer via Web USB or Bluetooth
3. **Android IP config** — add a settings screen in the Android app to set the backend IP
4. **Multi-terminal support** — register multiple Android devices as separate terminals
5. **Production deployment** — Docker + HTTPS + proper PCI-DSS assessment
