FROM node:20-alpine AS web-builder

WORKDIR /app

COPY packages/web/package.json ./
RUN npm install
COPY packages/web/ ./
RUN npm run build

FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY packages/server/package.json ./packages/server/
COPY packages/knowledge-base/package.json ./packages/knowledge-base/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Copy pre-built web dist
COPY --from=web-builder /app/dist ./packages/web/dist

# Build server and knowledge-base (skip web)
RUN npm run build

# Expose port
EXPOSE 54509

# Start
CMD ["node", "packages/server/dist/index.js"]
