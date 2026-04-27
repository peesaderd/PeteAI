FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build
RUN yarn build

# Expose port
EXPOSE 54509

# Start
CMD ["node", "packages/server/dist/index.js"]
