# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# OCI labels
LABEL org.opencontainers.image.title="Serverless Elysia Redis HTTP"
LABEL org.opencontainers.image.description="Upstash-compatible REST API adapter for Redis"
LABEL org.opencontainers.image.source="https://github.com/drew-foxall/Serverless-Elysia-Redis-HTTP"
LABEL org.opencontainers.image.licenses="MIT"

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY ./src ./src
COPY tsconfig.json package.json ./

# run the app
USER bun
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080/tcp
ENTRYPOINT ["bun", "run", "src/index.ts"]
