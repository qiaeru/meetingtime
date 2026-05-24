# --- Builder stage ---------------------------------------------------------
FROM node:26-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for cached deps install.
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm install

# Copy sources and build.
COPY tsconfig.base.json ./
COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/

RUN npm run build

# --- Runtime stage ---------------------------------------------------------
FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy node_modules + workspace manifests + built artifacts from the builder.
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared/package.json shared/
COPY --from=builder /app/shared/dist shared/dist
COPY --from=builder /app/server/package.json server/
COPY --from=builder /app/server/dist server/dist

# Drop root: the official node:alpine image ships a `node` user (uid 1000).
# Running unprivileged limits the blast radius if a future vulnerability in
# a dependency lets an attacker execute code in the container.
USER node

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
