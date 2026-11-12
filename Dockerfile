FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++ sqlite-dev
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# We skip build during creation to allow for dynamic changes in development
# In production, you would run build here

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=development
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app ./

EXPOSE 3000

# We use 'pnpm run dev' for now to allow for easier development and testing
CMD ["pnpm", "run", "dev"]
