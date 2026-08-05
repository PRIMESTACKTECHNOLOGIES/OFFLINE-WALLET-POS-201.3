# ── Stage 1: Build the React client ──────────────────────────────────────────
FROM node:20-bookworm-slim AS client-build
WORKDIR /app/client

COPY client/package*.json ./
RUN npm install --no-audit --no-fund

COPY client ./
# Point the client at the backend (same origin in production — served by Express)
ENV VITE_API_URL=""
RUN npm run build

# ── Stage 2: Build the TypeScript backend ────────────────────────────────────
FROM node:20-bookworm-slim AS backend-build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config sqlite3 libsqlite3-dev libpcsclite-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./backend/
# Use --ignore-scripts to skip native builds (nfc-pcsc) that require hardware
RUN npm --prefix backend install --no-audit --no-fund --ignore-scripts

COPY backend ./backend
RUN npm --prefix backend run build

# ── Stage 3: Production runtime ───────────────────────────────────────────────
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 libsqlite3-dev libpcsclite-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install production backend deps (skip native builds)
COPY backend/package*.json ./backend/
RUN npm --prefix backend install --omit=dev --no-audit --no-fund --ignore-scripts

# Copy compiled backend
COPY --from=backend-build /app/backend/dist ./backend/dist

# Copy built client into backend's public folder so Express can serve it
COPY --from=client-build /app/client/dist ./backend/dist/public

# Writable directory for SQLite database (mount a volume here on Render disk)
RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 10000
CMD ["node", "/app/backend/dist/server.js"]
