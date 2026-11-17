# syntax=docker/dockerfile:1
# Platform: linux/arm64 (Raspberry Pi) and linux/amd64

FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++ sqlite-dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++ sqlite-dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN test -d node_modules/better-sqlite3 \
  && test -f src/lib/migrations/backup-cli.cjs
ENV NEXT_TELEMETRY_DISABLED=1
# Build must not require a live DB (lazy getDb at runtime only)
ENV NEXT_PHASE=phase-production-build
RUN npm run build
RUN test -f .next/standalone/server.js \
  && test -d .next/standalone/node_modules/better-sqlite3

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat sqlite-libs

ARG APP_UID=1000
ARG APP_GID=1000

# node:22-alpine already has user `node` at uid/gid 1000 — do not addgroup/adduser.
RUN set -eux; \
    if [ "$APP_UID" != "1000" ] || [ "$APP_GID" != "1000" ]; then \
      apk add --no-cache shadow; \
      if getent passwd "$APP_UID" | grep -qv '^node:'; then \
        echo "ERROR: UID ${APP_UID} already in use" >&2; exit 1; \
      fi; \
      if getent group "$APP_GID" | grep -qv '^node:'; then \
        echo "ERROR: GID ${APP_GID} already in use" >&2; exit 1; \
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