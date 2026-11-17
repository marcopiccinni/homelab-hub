# syntax=docker/dockerfile:1

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
RUN npm run build
RUN test -f .next/standalone/server.js \
  && test -d .next/standalone/node_modules/better-sqlite3

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat sqlite-libs

ARG APP_UID=1000
ARG APP_GID=1000

# Official node images already ship user `node` (typically uid/gid 1000).
RUN set -eux; \
    if [ "$APP_UID" = "1000" ] && [ "$APP_GID" = "1000" ]; then \
      id node; \
    else \
      apk add --no-cache shadow; \
      if getent passwd "$APP_UID" >/dev/null 2>&1 \
        && ! getent passwd "$APP_UID" | cut -d: -f1 | grep -qx node; then \
        echo "ERROR: UID ${APP_UID} is already in use" >&2; exit 1; \
      fi; \
      if getent group "$APP_GID" >/dev/null 2>&1 \
        && ! getent group "$APP_GID" | cut -d: -f1 | grep -qx node; then \
        echo "ERROR: GID ${APP_GID} is already in use" >&2; exit 1; \
      fi; \
      groupmod -o -g "$APP_GID" node; \
      usermod -o -u "$APP_UID" -g "$APP_GID" node; \
    fi

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# backup-cli.cjs is executed at runtime outside the Next bundle
COPY --from=builder --chown=node:node /app/src/lib/migrations ./src/lib/migrations

RUN mkdir -p /app/data /app/data/backups /app/public/uploads \
  && chown -R node:node /app/data /app/public/uploads

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>process.exit(j.status==='ok'?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]