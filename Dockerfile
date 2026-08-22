# ── Stage 1: Build the TypeScript backend ────────────────────────────────────
FROM node:20-bookworm-slim AS backend-build
WORKDIR /app

ARG NPM_TOKEN
RUN echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > /root/.npmrc

# Build tools needed for better-sqlite3 native compile
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config sqlite3 libsqlite3-dev libpcsclite-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./backend/
RUN npm --prefix backend install --no-audit --no-fund --ignore-scripts \
 && npm --prefix backend rebuild better-sqlite3

RUN rm -f /root/.npmrc

COPY backend ./backend
RUN npm --prefix backend run build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

ARG NPM_TOKEN

# Build tools required to compile better-sqlite3 for THIS runtime environment
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config libsqlite3-dev libpcsclite-dev \
    && rm -rf /var/lib/apt/lists/*

RUN if [ -n "$NPM_TOKEN" ]; then echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > /root/.npmrc; fi
COPY backend/package*.json ./backend/

# Install prod deps then compile better-sqlite3 natively for this exact runtime
RUN npm --prefix backend install --omit=dev --no-audit --no-fund --ignore-scripts \
 && npm --prefix backend rebuild better-sqlite3

RUN rm -f /root/.npmrc

# Copy compiled backend
COPY --from=backend-build /app/backend/dist ./backend/dist

# Copy pre-built React client
COPY client/dist ./backend/dist/public

# Writable directories for SQLite database
RUN mkdir -p /app/data /app/backend/data && chown -R node:node /app/data /app/backend/data

USER node

EXPOSE 10000
CMD ["node", "/app/backend/dist/server.js"]
