FROM node:20-alpine

WORKDIR /app

# Install docker CLI for Docker management
RUN apk add --no-cache docker-cli

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/ ./dist/

EXPOSE 54520

CMD ["node", "dist/index.js"]
