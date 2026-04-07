# ── Stage 1: Build ───────────────────────────────────────────
FROM --platform=linux/amd64 node:20-slim AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install ALL deps (including devDeps needed for tsc)
RUN npm ci

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ── Stage 2: Production image ────────────────────────────────
FROM --platform=linux/amd64 node:20-slim AS runtime

WORKDIR /app

# Install only production deps; rebuild native modules (better-sqlite3) for linux/amd64
COPY package*.json ./
RUN npm ci --omit=dev && \
    apt-get update && apt-get install -y --no-install-recommends python3 make g++ && \
    npm rebuild better-sqlite3 && \
    apt-get remove -y python3 make g++ && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Copy compiled output and static assets
COPY --from=builder /app/dist ./dist
COPY public/ ./public/
COPY fga/ ./fga/
# .env is NOT copied — credentials come from Cloud Run environment variables

# Cloud Run always listens on 8080
ENV PORT=8080
ENV NODE_ENV=production

# Create data directory for SQLite (ephemeral in Cloud Run — ok for demo)
RUN mkdir -p /tmp/lokaguard-data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:8080/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
