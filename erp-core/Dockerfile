# ============================================================
# ERP Core — Multi-stage Docker Build
# ============================================================

# ---- Stage 1: Install dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./
COPY packages/server/package.json ./packages/server/
COPY packages/knowledge-base/package.json ./packages/knowledge-base/
COPY packages/sync-siyuan/package.json ./packages/sync-siyuan/
COPY packages/ai-orchestrator/package.json ./packages/ai-orchestrator/

# Install all dependencies
RUN npm ci

# ---- Stage 2: Build TypeScript ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build -w packages/server \
    && npm run build -w packages/knowledge-base \
    && npm run build -w packages/sync-siyuan \
    && npm run build -w packages/ai-orchestrator

# ---- Stage 3: Production image ----
FROM node:22-alpine AS runner
WORKDIR /app

# Install PM2 globally
RUN npm install -g pm2

# Copy built artifacts
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/knowledge-base/dist ./packages/knowledge-base/dist
COPY --from=build /app/packages/knowledge-base/package.json ./packages/knowledge-base/
COPY --from=build /app/packages/sync-siyuan/dist ./packages/sync-siyuan/dist
COPY --from=build /app/packages/sync-siyuan/package.json ./packages/sync-siyuan/
COPY --from=build /app/packages/ai-orchestrator/dist ./packages/ai-orchestrator/dist
COPY --from=build /app/packages/ai-orchestrator/package.json ./packages/ai-orchestrator/

# Copy ecosystem config
COPY ecosystem.config.cjs ./

# Create data directories
RUN mkdir -p /app/packages/server/data \
    /app/packages/knowledge-base/data \
    /app/packages/sync-siyuan/data

EXPOSE 3000 3100 54513 54516

CMD ["pm2-runtime", "start", "ecosystem.config.cjs"]
