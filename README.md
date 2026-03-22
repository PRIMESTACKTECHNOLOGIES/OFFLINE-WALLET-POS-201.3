# POS Offline Software - Protocol 201.3

This project implements the POS Offline Protocol 201.3 with a Node.js backend and a React frontend dashboard.

## Prerequisites

- Node.js (v18+)
- PostgreSQL (ensure database `pos_offline_db` exists and `schema.sql` is run)

## Setup

1.  **Backend Setup**:
    ```bash
    npm install
    ```
    Create a `.env` file (optional) or use default config in `src/config/db.ts`.

2.  **Frontend Setup**:
    ```bash
    cd client
    npm install
    ```

## Running the Application

To start both backend and frontend servers:

**Windows (Double-click):**
- Run `start_all.bat`

**Manual Start:**

1.  **Start Backend** (Terminal 1):
    ```bash
    npm run dev
    ```
    Server runs at: http://localhost:3000

2.  **Start Frontend** (Terminal 2):
    ```bash
    cd client
    npm run dev
    ```
    Dashboard runs at: http://localhost:5173 (or next available port, e.g., 5174)

## Features

- **Protocol 201.3**: Secure offline batch processing.
- **Security**: HMAC-SHA256 signature verification, API Key authentication.
- **Idempotency**: Prevents duplicate transactions.
- **Dashboard**: View uploaded batches and transaction details.

## API Endpoints

- `POST /merchant/v1/pos/201.3/offline-batch`: Upload offline batch.
- `GET /merchant/v1/pos/201.3/batches`: List batches.
- `GET /merchant/v1/pos/201.3/batches/:batchId`: Get batch details.


## Deployment

### Option 1: Docker (Local / VPS)
You can run the entire application (Frontend + Backend + Database) with a single command:
```bash
docker-compose up -d --build
```
- Access the dashboard at `http://localhost:3000` (or your server's IP).
- Data is persisted in the `./data` folder.

### Option 2: Render (Cloud Hosting)

**Step 1: Push to GitHub**
1. Create a new repository on GitHub.
2. Push this project code to the repository.

**Step 2: Deploy on Render**
1. Go to [dashboard.render.com](https://dashboard.render.com/).
2. Click **New +** -> **Blueprints**.
3. Connect your GitHub repository.
4. Render will automatically detect the `render.yaml` file.
5. Click **Apply**.

**Important Note for SQLite Persistence:**
- The `render.yaml` is configured to use a **Disk** for persistent storage (`/var/lib/data`).
- This requires a **Paid Plan (Starter)** on Render (~$7/month).
- If you use the Free Tier, the database will be reset every time the server restarts (not recommended for production).
