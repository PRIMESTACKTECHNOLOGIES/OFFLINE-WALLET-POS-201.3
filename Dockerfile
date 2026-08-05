FROM node:20-alpine AS build
WORKDIR /app

COPY backend/package*.json ./backend/
RUN npm --prefix backend install --no-audit --no-fund

COPY backend ./backend
RUN npm --prefix backend run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

COPY backend/package*.json ./backend/
RUN npm --prefix backend install --omit=dev --no-audit --no-fund
COPY --from=build /app/backend/dist ./backend/dist

EXPOSE 10000
CMD ["node","/app/backend/dist/server.js"]
