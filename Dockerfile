# ── Stage 1: Build the TypeScript backend ────────────────────────────────────
FROM node:20-bookworm-slim AS backend-build
WORKDIR /app

# ── NPM_TOKEN build-arg: pass at build time, never stored in the final image.
#    Example:  docker build --build-arg NPM_TOKEN=npm_xxxx .
ARG NPM_TOKEN
RUN echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > /root/.npmrc

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config sqlite3 libsqlite3-dev libpcsclite-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./backend/
# Use --ignore-scripts to skip native builds (nfc-pcsc) that require hardware,
# then explicitly rebuild only sqlite3 so its native binding compiles for Linux.
RUN npm --prefix backend install --no-audit --no-fund --ignore-scripts \
 && npm --prefix backend rebuild sqlite3

# Always destroy the build-time npmrc before COPYing source.
RUN rm -f /root/.npmrc

COPY backend ./backend
RUN npm --prefix backend run build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

# Do NOT carry forward NPM_TOKEN into the production runtime. Only build-stage needs it.
ARG NPM_TOKEN

RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 libsqlite3-dev libpcsclite-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install production backend deps (skip native builds) — re-use build-arg if present.
RUN if [ -n "$NPM_TOKEN" ]; then echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > /root/.npmrc; fi
COPY backend/package*.json ./backend/
RUN npm --prefix backend install --omit=dev --no-audit --no-fund --ignore-scripts \
 && npm --prefix backend rebuild sqlite3
RUN rm -f /root/.npmrc

# Copy compiled backend
COPY --from=backend-build /app/backend/dist ./backend/dist

# Copy pre-built React client (built locally, committed to repo)
COPY client/dist ./backend/dist/public

# Writable directory for SQLite database
RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 10000
CMD ["node", "/app/backend/dist/server.js"]
