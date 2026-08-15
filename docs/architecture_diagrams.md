# Architecture Diagrams — Offline POS → Merchant Wallet → Crypto → Settlement

This document contains text-first Mermaid diagrams you can copy/paste into docs or renderers.

## 1) High-level system flow

```mermaid
flowchart TD
  C[Customer\n(pays offline via POS)] --> POS[Merchant POS App\n(offline)]
  POS -->|Sync when online| Prime[PrimeStack Backend\n(receives POS sale, credits wallet)]
  Prime --> Wallet[Merchant Wallet (USD)\n(balance increases, can buy crypto)]
  Wallet --> Exchange[Crypto Exchange (API)\n(Binance/Bybit/OKX)]
  Exchange --> Bank[Bank / PSP\n(sends real money, settlement)]
```

### ASCII (copyable)

```
Customer → Merchant → PrimeStack → Exchange → Bank

┌──────────────────────────┐
│        Customer          │
│  (pays offline via POS)  │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│     Merchant POS App     │
│  • Reads card (NFC/Chip) │
│  • Stores offline txn    │
│  • No internet needed    │
└──────────────┬───────────┘
               │ Sync when online
               ▼
┌──────────────────────────┐
│     PrimeStack Backend   │
│  • Receives POS sale     │
│  • Credits merchant wallet
│  • Creates settlement record
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│   Merchant Wallet (USD)  │
│  • Balance increases     │
│  • Can buy crypto        │
│  • Can withdraw crypto   │
└──────────────┬───────────┘
               │ Crypto Purchase
               ▼
┌──────────────────────────┐
│   Crypto Exchange (API)  │
│  • Executes buy order    │
│  • Executes withdrawal   │
└──────────────┬───────────┘
               │ Settlement later
               ▼
┌──────────────────────────┐
│         Bank / PSP       │
│  • Sends real money      │
│  • Merchant settlement   │
└──────────────────────────┘
```

## 2) Offline POS transaction lifecycle

```mermaid
flowchart TD
  Cust[Customer taps card] --> POSDB[POS App stores txn\n(amount, masked PAN, STAN, ts, entryMode)]
  POSDB --> Sync[POS SyncWorker\n(when internet returns)]
  Sync --> Backend[/pos/offline-sale\n(credits merchant wallet, creates settlement, logs ledger)]
  Backend --> Wallet2[Merchant Wallet Balance\n(now has REAL usable USD)]
```

### Short summary

Even though the customer paid offline, the merchant wallet is credited immediately after sync — enabling immediate merchant actions (e.g., crypto purchases).

## 3) Crypto purchase + settlement flow

```mermaid
flowchart TD
  W[Merchant Wallet (USD)\nBalance = 100 AED] --> Purchase[/merchant/:id/crypto/purchase\n(debit wallet, call exchange, store crypto balance)]
  Purchase --> Ex[Crypto Exchange\n(executes trade, returns fills)]
  Ex --> MC[Merchant Crypto Balance\n(USDT/BTC stored)]
  MC --> Settlement[Settlement Module\n(bank sends real money, mark POS sale settled)]
```

### Key point

Crypto purchase debits the merchant wallet (credited after POS sync), not the customer bank — settlement with the bank happens later.

## 4) Full system overview

```mermaid
flowchart TD
  Customer --> OfflinePOS[Offline POS App]\n  OfflinePOS --> LocalDB[Local Room DB (offline queue)]
  LocalDB --> SyncW[SyncWorker → Backend]
  SyncW --> Prime2[PrimeStack / Backend]
  Prime2 --> MW[Merchant Wallet (USD)]
  subgraph WalletActions
    MW -->|Buy Crypto| Exchange2[Exchange API]
    MW -->|Payout| Settlement2[Bank / Crypto]
  end
```

## 5) Why this architecture is correct

- Offline payments do NOT block crypto purchase — merchant wallet is credited after sync.
- Merchant wallet is the source of truth for merchant actions.
- Settlement with bank/PSP happens later (asynchronous).
- No DB schema changes required; flows map to existing endpoints (/pos/offline-sale, /merchant/:id/crypto/purchase, settlement module).

---

If you want, I can:

- Export these Mermaid diagrams to PNG/SVG files and add them to the repo (requires a mermaid CLI or `mmdc`); or
- Generate PlantUML or SVG markup instead.

Tell me which export you want and I'll add the files under `docs/`.

