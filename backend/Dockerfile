# ---------- Stage 1: build ----------
FROM node:22-bookworm-slim AS build

# better-sqlite3 may need native build tools when a prebuilt binary is unavailable.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# ---------- Stage 2: runtime ----------
FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/app/data/masterview.sqlite

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Run unprivileged. The container previously ran as root, so any escape or
# Node-level RCE landed as root on the host volume holding the SQLite ledger.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]