# POS Offline Software

> Last updated: August 2026

This repository contains an offline-capable POS platform with a React + Vite dashboard, a Node.js/TypeScript backend, and an Android client. The core business flow is:

1. A customer pays with a card.
2. The payment is recorded and credited to the merchant wallet.
3. Later, a payout can be requested and sent to a bank account through a payout provider.

## Money flow overview

- Card payment enters through the payments controller and service.
- The backend records a ledger entry and credits the merchant wallet.
- Batch and settlement records are created for reconciliation.
- A payout request later debits the merchant wallet and sends funds to the configured bank destination.

## Full payout flow

See [docs/payout-flow-diagram.md](docs/payout-flow-diagram.md) for the end-to-end diagram.

### Main flow

1. Customer payment request
   - [backend/src/domain/payments/payments.controller.ts](backend/src/domain/payments/payments.controller.ts)
   - [backend/src/domain/payments/payments.service.ts](backend/src/domain/payments/payments.service.ts)

2. Ledger and wallet credit
   - [backend/src/domain/ledger/ledger.service.ts](backend/src/domain/ledger/ledger.service.ts)
   - [backend/src/domain/wallets/wallets.service.ts](backend/src/domain/wallets/wallets.service.ts)

3. Settlement / batching
   - [backend/src/domain/batches/batches.service.ts](backend/src/domain/batches/batches.service.ts)
   - [backend/src/domain/settlements/settlements.router.ts](backend/src/domain/settlements/settlements.router.ts)

4. Payout request and provider submission
   - [backend/src/domain/payouts/bank.router.ts](backend/src/domain/payouts/bank.router.ts)
   - [backend/src/domain/payouts/payoutHelpers.ts](backend/src/domain/payouts/payoutHelpers.ts)
   - [backend/src/domain/payouts/payoutProvider.service.ts](backend/src/domain/payouts/payoutProvider.service.ts)

5. Persistent storage
   - [backend/src/config/db.ts](backend/src/config/db.ts)

## Quick start

### Windows

Use the helper scripts in the repository root:

- Run [start_all.bat](start_all.bat) to start the backend and frontend together.
- Or run [start_dev.ps1](start_dev.ps1) from PowerShell.

### Manual start

From the repository root:

1. Install backend dependencies
   - cd backend
   - npm install

2. Install frontend dependencies
   - cd client
   - npm install

3. Start the backend
   - cd backend
   - npm run dev

4. Start the frontend
   - cd client
   - npm run dev

Default local URLs:
- Backend: http://localhost:7000
- Frontend: http://localhost:7001

## Configuration

Copy the backend environment template before running the app:

- [backend/.env.example](backend/.env.example) → [backend/.env](backend/.env)

Important variables:
- PORT=7000
- JWT_SECRET=your_secret_here
- BANK_PAYOUT_PROVIDER=wise or external
- BANK_PAYOUT_API_URL
- BANK_PAYOUT_API_KEY or WISE_API_KEY

## Build commands

From the repository root:

- Backend build: cd backend && npm run build
- Frontend build: cd client && npm run build

## Project structure

- [backend](backend) — Express API, SQLite schema, domain services, auth, payments, terminals, transactions
- [client](client) — Vite React frontend and POS pages
- [android_pos_app](android_pos_app) — Android app
- [docker-compose.yml](docker-compose.yml) — container-based startup template
- [start_all.bat](start_all.bat) and [start_dev.ps1](start_dev.ps1) — local development helpers

## Notes

This codebase includes offline transaction logic and live payment integration hooks, but it is not a PCI-certified payment solution. Any production deployment should be reviewed for compliance, secure storage, and operational controls before handling real customer payments at scale.
