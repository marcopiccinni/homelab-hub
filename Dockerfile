# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++ sqlite-dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++ sqlite-dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat sqlite-libs

ARG APP_UID=1000
ARG APP_GID=1000
RUN addgroup -g "${APP_GID}" homelab && adduser -D -u "${APP_UID}" -G homelab homelab

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder --chown=homelab:homelab /app/.next/standalone ./
COPY --from=builder --chown=homelab:homelab /app/.next/static ./.next/static

RUN mkdir -p /app/data /app/data/backups /app/public/uploads \
  && chown -R homelab:homelab /app/data /app/public/uploads

USER homelab

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>process.exit(j.status==='ok'?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]