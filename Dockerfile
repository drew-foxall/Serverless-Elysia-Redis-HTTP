# Build stage - compile to binary
FROM oven/bun:1 AS build

WORKDIR /app

# Cache packages installation
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source files
COPY ./src ./src
COPY tsconfig.json ./

ENV NODE_ENV=production

# Compile to standalone binary (2-3x less memory usage)
RUN bun build \
	--compile \
	--minify-whitespace \
	--minify-syntax \
	--target bun-linux-x64 \
	--outfile server \
	src/index.ts

# Production image - minimal Distroless base
FROM gcr.io/distroless/base-debian12

# OCI labels for Docker Hub
LABEL org.opencontainers.image.title="Serverless Elysia Redis HTTP"
LABEL org.opencontainers.image.description="Upstash-compatible REST API adapter for Redis"
LABEL org.opencontainers.image.source="https://github.com/drew-foxall/Serverless-Elysia-Redis-HTTP"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="drewgarratt382"

WORKDIR /app

# Copy compiled binary from build stage
COPY --from=build /app/server server

ENV NODE_ENV=production
ENV PORT=8080

# Run as non-root (distroless default)
USER nonroot

EXPOSE 8080

CMD ["./server"]
