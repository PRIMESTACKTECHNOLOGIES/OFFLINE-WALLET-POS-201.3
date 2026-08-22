# ── Stage 1: Build the TypeScript backend ────────────────────────────────────
FROM node:20-bookworm-slim AS backend-build
WORKDIR /app

# ── NPM_TOKEN build-arg: pass at build time, never stored in the final image.
ARG NPM_TOKEN
RUN echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > /root/.npmrc

# Install build tools + sqlite headers (needed for better-sqlite3 native compile)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config sqlite3 libsqlite3-dev libpcsclite-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./backend/
# Install ALL deps (including devDependencies for tsc), skip nfc-pcsc hardware scripts,
# then rebuild better-sqlite3 native binding for this Linux target.
RUN npm --prefix backend install --no-audit --no-fund --ignore-scripts \
 && npm --prefix backend rebuild better-sqlite3

# Destroy build-time npmrc before copying source
RUN rm -f /root/.npmrc

COPY backend ./backend
RUN npm --prefix backend run build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

ARG NPM_TOKEN

# Runtime libs only — no build tools needed (we copy compiled binary from Stage 1)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-dev libpcsclite-dev \
    && rm -rf /var/lib/apt/lists/*

# Install production deps with --ignore-scripts (skip nfc-pcsc)
RUN if [ -n "$NPM_TOKEN" ]; then echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > /root/.npmrc; fi
COPY backend/package*.json ./backend/
RUN npm --prefix backend install --omit=dev --no-audit --no-fund --ignore-scripts
RUN rm -f /root/.npmrc

# Copy the already-compiled better-sqlite3 native binding from Stage 1
# This avoids rebuilding (and needing build tools) in the production image
COPY --from=backend-build /app/backend/node_modules/better-sqlite3 ./backend/node_modules/better-sqlite3

# Copy compiled backend dist
COPY --from=backend-build /app/backend/dist ./backend/dist

# Copy pre-built React client (built locally, committed to repo)
COPY client/dist ./backend/dist/public

# Writable directory for SQLite database
RUN mkdir -p /app/data /app/backend/data && chown -R node:node /app/data /app/backend/data

USER node

EXPOSE 10000
CMD ["node", "/app/backend/dist/server.js"]
