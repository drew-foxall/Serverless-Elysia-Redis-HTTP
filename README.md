# Serverless Elysia Redis HTTP

A highly flexible **Redis-to-Upstash REST API adapter** built with [Elysia](https://elysiajs.com/) and [Bun](https://bun.sh/). This project provides an Upstash-compatible HTTP interface to any Redis instance.

## Why?

- **Quick to start** - Single `docker-compose up` or `bun run dev` to get running
- **Run anywhere** - Docker, Bun standalone, or any container platform
- **Flexible Redis** - Point to any Redis instance (local, remote, cluster)
- **Production-ready** - Suitable for local testing, CI/CD, and deployments behind firewalls
- **Type-safe** - Full TypeScript with types derived from `@upstash/redis`

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone and start with Docker Compose (includes Redis)
git clone <your-repo>
cd serverless-elysia-redis-http
docker-compose up -d

# Server running at http://localhost:8080
```

### Option 2: Bun (Development)

```bash
# Prerequisites: Bun v1.0+, Redis instance

git clone <your-repo>
cd serverless-elysia-redis-http
bun install
cp env.example .env
bun run dev
```

### Using with @upstash/redis

Point the official Upstash client at your local server:

```typescript
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: "http://localhost:8080",
  token: "your-secret-token-here", // Must match UPSTASH_TOKEN env var
});

// Use as normal!
await redis.set("foo", "bar");
const value = await redis.get("foo"); // "bar"
```

## API Reference

This adapter implements the Upstash REST API format:

### Execute Single Command

**POST /**

```bash
# Execute command via JSON body
curl -X POST http://localhost:8080 \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '["SET", "mykey", "myvalue"]'

# Response: { "result": "OK" }
```

### Path-Based Commands

**GET/POST /{command}/{arg1}/{arg2}/...**

```bash
# GET command via path
curl http://localhost:8080/GET/mykey \
  -H "Authorization: Bearer your-token"

# Response: { "result": "myvalue" }

# SET via path
curl http://localhost:8080/SET/foo/bar \
  -H "Authorization: Bearer your-token"

# Response: { "result": "OK" }

# HSET via path
curl http://localhost:8080/HSET/myhash/field1/value1 \
  -H "Authorization: Bearer your-token"

# Response: { "result": 1 }
```

### Pipeline (Multiple Commands)

**POST /pipeline**

Execute multiple commands in a single request without transaction guarantees:

```bash
curl -X POST http://localhost:8080/pipeline \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '[
    ["SET", "k1", "v1"],
    ["SET", "k2", "v2"],
    ["GET", "k1"],
    ["GET", "k2"]
  ]'

# Response: [
#   { "result": "OK" },
#   { "result": "OK" },
#   { "result": "v1" },
#   { "result": "v2" }
# ]
```

### Transaction (MULTI/EXEC)

**POST /multi-exec**

Execute multiple commands atomically:

```bash
curl -X POST http://localhost:8080/multi-exec \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '[
    ["INCR", "counter"],
    ["INCR", "counter"],
    ["GET", "counter"]
  ]'

# Response: [
#   { "result": 1 },
#   { "result": 2 },
#   { "result": "2" }
# ]
```

### Health Check

**GET /health**

Health check endpoint for load balancers (no authentication required):

```bash
curl http://localhost:8080/health

# Response: { "status": "ok", "timestamp": 1702749600000 }
```

## Authentication

Authentication is optional. When `UPSTASH_TOKEN` or `TOKEN` environment variable is set, the server requires authentication.

### Bearer Token

```bash
curl -H "Authorization: Bearer your-token" http://localhost:8080/PING
```

### Basic Auth

```bash
# Base64 encode "default:your-token"
curl -H "Authorization: Basic ZGVmYXVsdDp5b3VyLXRva2Vu" http://localhost:8080/PING
```

## Configuration

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `PORT` | `8080` | HTTP server port |
| `UPSTASH_TOKEN` / `TOKEN` | - | Auth token (optional but recommended) |
| `VERBOSE` | `false` | Enable verbose logging |
| `MAX_BODY_SIZE` | `1048576` | Max request body (1MB) |
| `CONNECTION_TIMEOUT` | `5000` | Redis connection timeout (ms) |
| `COMMAND_TIMEOUT` | `30000` | Redis command timeout (ms) |

### Security Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `COMMAND_FILTER_MODE` | `blocklist` | `blocklist`, `allowlist`, or `none` |
| `BLOCKED_COMMANDS` | - | Additional commands to block (comma-separated) |
| `ALLOWED_COMMANDS` | - | Additional commands to allow (comma-separated) |
| `RATE_LIMIT_ENABLED` | `false` | Enable rate limiting (not part of Upstash API) |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (1 minute) |

### Connection Pool Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_POOL_ENABLED` | `false` | Enable connection pooling |
| `REDIS_POOL_MIN` | `2` | Minimum pool connections |
| `REDIS_POOL_MAX` | `10` | Maximum pool connections |

### Cluster Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_CLUSTER_ENABLED` | `false` | Enable Redis Cluster mode |
| `REDIS_CLUSTER_NODES` | - | Comma-separated node URLs |
| `REDIS_CLUSTER_SCALE_READS` | `master` | `master`, `slave`, or `all` |

### Connection Modes

The adapter supports three connection modes:

| Mode | Use Case | Enable With |
|------|----------|-------------|
| **Single** (default) | Development, low traffic | Just set `REDIS_URL` |
| **Pool** | High throughput | `REDIS_POOL_ENABLED=true` |
| **Cluster** | Redis Cluster deployments | `REDIS_CLUSTER_ENABLED=true` |

**Pool mode** uses round-robin to distribute requests across connections.

**Cluster mode** supports read scaling:
- `master` - Strongest consistency (default)
- `slave` - Lower latency, eventual consistency
- `all` - Best throughput

## Security

This adapter includes several security features enabled by default:

### Command Filtering

By default, dangerous Redis commands are blocked to prevent:
- **Data destruction**: `FLUSHALL`, `FLUSHDB`
- **Server reconfiguration**: `CONFIG`, `ACL`
- **Arbitrary code execution**: `EVAL`, `EVALSHA`, `SCRIPT`, `MODULE`, `FUNCTION`
- **Denial of service**: `SHUTDOWN`, `DEBUG`
- **Data exfiltration**: `MIGRATE`, `SLAVEOF`, `REPLICAOF`
- **Performance issues**: `KEYS` (use `SCAN` instead)

**Filter Modes:**

```bash
# Default: Block known dangerous commands
COMMAND_FILTER_MODE=blocklist

# Most restrictive: Only allow explicitly safe commands
COMMAND_FILTER_MODE=allowlist

# Dangerous: Allow all commands (not recommended!)
COMMAND_FILTER_MODE=none
```

### Timing-Safe Authentication

Authentication uses constant-time comparison to prevent timing attacks on the token.

### Credential Masking

Redis URLs with passwords are automatically masked in logs to prevent credential leakage.

### Error Message Sanitization

Internal Redis errors are sanitized before being returned to clients to prevent information disclosure.

### Rate Limiting (Optional)

> **Note:** This is an additional development feature, not part of the Upstash REST API. For Upstash-compatible rate limiting, use [@upstash/ratelimit](https://github.com/upstash/ratelimit-js).

Server-side rate limiting is available but **disabled by default**:

```bash
# Enable rate limiting (default: false)
RATE_LIMIT_ENABLED=true

# Maximum requests per window (default: 100)
RATE_LIMIT_MAX=100

# Time window in milliseconds (default: 60000 = 1 minute)
RATE_LIMIT_WINDOW_MS=60000
```

When enabled, responses include standard headers:
- `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
- `Retry-After` (on 429 responses)

Rate limits are applied per-token or per-IP. Health checks (`/health`) are exempt.

### Request Body Validation

All request bodies are validated against strict schemas to prevent:
- **Malformed commands**: Bodies must be properly structured arrays or objects
- **Type confusion**: Command arguments are type-checked at runtime
- **Body size attacks**: Maximum body size is enforced (default: 1MB)

## Docker

### Pull and Run

```bash
# Pull from Docker Hub
docker pull drewgarratt382/serverless-elysia-redis-http

# Run with external Redis
docker run -d -p 8080:8080 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e UPSTASH_TOKEN=your-token \
  drewgarratt382/serverless-elysia-redis-http
```

### Build Locally

```bash
# Build from source
docker build -t serverless-elysia-redis-http .
```

### Docker Compose

Run both the adapter and Redis together:

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Supported Redis Commands

This adapter proxies Redis commands with security filtering. By default, dangerous commands are blocked (see [Command Filtering](#command-filtering)).

### Safe Commands (Always Allowed)

**Strings**: `GET`, `SET`, `MGET`, `MSET`, `INCR`, `DECR`, `APPEND`, `STRLEN`, `GETEX`, `GETDEL`

**Hashes**: `HGET`, `HSET`, `HMGET`, `HMSET`, `HGETALL`, `HDEL`, `HEXISTS`, `HINCRBY`, `HSCAN`

**Lists**: `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LRANGE`, `LLEN`, `LINDEX`, `BLPOP`, `BRPOP`

**Sets**: `SADD`, `SREM`, `SMEMBERS`, `SISMEMBER`, `SCARD`, `SUNION`, `SINTER`, `SSCAN`

**Sorted Sets**: `ZADD`, `ZREM`, `ZRANGE`, `ZRANGEBYSCORE`, `ZSCORE`, `ZCARD`, `ZINCRBY`, `ZSCAN`

**Keys**: `DEL`, `EXISTS`, `EXPIRE`, `TTL`, `SCAN`, `TYPE`, `RENAME`, `UNLINK`, `COPY`

**Server**: `PING`, `ECHO`, `INFO`, `DBSIZE`, `TIME`

**Streams**: `XADD`, `XREAD`, `XRANGE`, `XLEN`, `XGROUP`, `XACK`

**JSON**: `JSON.GET`, `JSON.SET`, `JSON.DEL`, `JSON.MGET` (RedisJSON module)

**Pub/Sub**: `PUBLISH`, `PUBSUB` (subscribe not supported via HTTP)

### Blocked by Default

These commands are blocked for security reasons:
- `FLUSHALL`, `FLUSHDB` - Data destruction
- `EVAL`, `EVALSHA`, `SCRIPT` - Code execution
- `CONFIG`, `ACL`, `MODULE` - Server configuration
- `SHUTDOWN`, `DEBUG` - Server control
- `KEYS` - Use `SCAN` instead (performance)
- `MIGRATE`, `SLAVEOF`, `REPLICAOF` - Data exfiltration

See [Command Filtering](#command-filtering) to customize.

## Development

```bash
# Run in development mode with hot reload
bun run dev

# Run tests
bun test

# Lint code
bun run lint

# Format code
bun run format
```

## Project Structure

```
src/
├── index.ts              # Application entry point
├── config.ts             # Configuration management
├── middleware/
│   ├── auth.ts           # Authentication middleware
│   └── command-filter.ts # Security command filtering
├── redis/
│   └── client.ts         # Redis client (single/pool/cluster)
├── routes/
│   └── commands.ts       # API route handlers
├── schemas/
│   └── command.ts        # Request body validation schemas
├── types/
│   ├── index.ts          # Type exports
│   └── upstash.ts        # Upstash-compatible types (from @upstash/redis)
├── utils/
│   ├── parser.ts         # Command parsing utilities
│   └── security.ts       # Security utilities
└── tests/
    ├── parser.test.ts    # Parser unit tests
    ├── security.test.ts  # Security tests
    ├── upstash-compat.test.ts  # Upstash format tests
    └── type-compat.test.ts     # Type compatibility tests
```

## Type Safety

This adapter uses types derived from `@upstash/redis` to ensure API compatibility:

```typescript
import type { UpstashResponse, UpstashRequest } from 'serverless-elysia-redis-http/types';

// Response format matches Upstash exactly
type Response = UpstashResponse<string>; // { result?: string; error?: string }
```

All responses follow the Upstash format:
- **Success**: `{ "result": <value> }`
- **Error**: `{ "error": "<message>" }`
- **Pipeline**: `[{ "result": <v1> }, { "result": <v2> }, ...]`

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a PR.