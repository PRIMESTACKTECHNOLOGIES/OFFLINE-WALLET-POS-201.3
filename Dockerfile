FROM node:20-bookworm-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config sqlite3 libsqlite3-dev libpcsclite-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./backend/
RUN npm --prefix backend install --no-audit --no-fund

COPY backend ./backend
RUN npm --prefix backend run build

FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 libsqlite3-dev libpcsclite-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./backend/
RUN npm --prefix backend install --omit=dev --no-audit --no-fund
COPY --from=build /app/backend/dist ./backend/dist

EXPOSE 10000
CMD ["node","/app/backend/dist/server.js"]
