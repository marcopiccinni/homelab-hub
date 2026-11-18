# syntax=docker/dockerfile:1
# Ottimizzato per build native arm64 (Raspberry Pi): glibc + binari precompilati.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Toolchain solo in deps: fallback se npm deve compilare moduli nativi (raro con prebuild arm64).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY . .
RUN test -d node_modules/better-sqlite3 \
  && test -d node_modules/sharp \
  && test -f src/lib/migrations/backup-cli.cjs
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PHASE=phase-production-build
RUN npm run build
RUN test -f .next/standalone/server.js \
  && test -d .next/standalone/node_modules/better-sqlite3 \
  && test -d .next/standalone/node_modules/sharp

FROM node:22-bookworm-slim AS runner

ARG APP_UID=1000
ARG APP_GID=1000

# Immagine ufficiale Node: utente `node` (di solito uid/gid 1000).
RUN set -eux; \
    if [ "$APP_UID" != "1000" ] || [ "$APP_GID" != "1000" ]; then \
      if getent passwd "$APP_UID" | grep -qv '^node:'; then \
        echo "ERROR: UID ${APP_UID} già in uso" >&2; exit 1; \
      fi; \
      if getent group "$APP_GID" | grep -qv '^node:'; then \
        echo "ERROR: GID ${APP_GID} già in uso" >&2; exit 1; \
      fi; \
      groupmod -o -g "$APP_GID" node; \
      usermod -o -u "$APP_UID" -g "$APP_GID" node; \
    fi; \
    id node

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL=file:./data/intranet.db

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/src/lib/migrations ./src/lib/migrations
COPY --from=builder --chown=node:node /app/scripts ./scripts

RUN mkdir -p /app/data /app/data/backups /app/public/uploads \
  && chown -R node:node /app/data /app/public/uploads

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>process.exit(j.status==='ok'?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]