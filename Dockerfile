# Use Bun as the base image
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Build stage (if needed for future compilation)
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Production image
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080

# Create non-root user
RUN addgroup --system --gid 1001 elysia
RUN adduser --system --uid 1001 elysia

# Copy application files
COPY --from=builder /app/src ./src
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Set ownership
RUN chown -R elysia:elysia /app

USER elysia

EXPOSE 8080

CMD ["bun", "run", "src/index.ts"]

