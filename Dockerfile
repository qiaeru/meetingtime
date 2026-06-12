# --- Builder stage ---------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for cached deps install. The lock is
# committed and load-bearing (it pins the musl Rolldown binding this Alpine
# build needs), so copy it unconditionally and install with `npm ci`, which
# follows it exactly and fails loudly on lock/manifest drift.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci

# Copy sources and build.
COPY tsconfig.base.json ./
COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/

RUN npm run build

# The client's runtime packages (CodeMirror, Shiki, Yjs, fonts...) are fully
# bundled into server/dist/public by the build, and the toolchain is only
# needed in this stage; reinstall just the server workspace's production
# dependencies so the runtime copy carries nothing else.
RUN rm -rf node_modules shared/node_modules server/node_modules client/node_modules \
  && npm ci --omit=dev -w server

# --- Runtime stage ---------------------------------------------------------
FROM node:24-alpine AS runtime
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
# busybox wget ships with Alpine; /healthz is served before the rate limiter
# so the probe never eats the per-IP budget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/healthz" || exit 1
CMD ["node", "server/dist/index.js"]
