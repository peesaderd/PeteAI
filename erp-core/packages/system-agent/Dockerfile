FROM node:20-alpine

WORKDIR /app

# Install docker CLI and git for doc generation
RUN apk add --no-cache docker-cli git

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/ ./dist/

EXPOSE 54520

CMD ["node", "dist/index.js"]
