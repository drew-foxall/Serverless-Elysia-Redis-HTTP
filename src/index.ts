import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { config } from "./config";
import { getFilterSummary } from "./middleware/command-filter";
import { requireAuth } from "./middleware/auth";
import { commandRoutes } from "./routes/commands";
import { maskRedisUrl } from "./utils/security";

// Build the app with conditional rate limiting
let app = new Elysia({
	serve: {
		maxRequestBodySize: config.maxBodySize,
	},
})
	// Global error handling
	.onError(({ code, error, set }) => {
		if (config.verbose) {
			console.error(`[Error] ${code}:`, error.message);
		}

		switch (code) {
			case "VALIDATION":
				set.status = 400;
				return { error: "Validation error" }; // Don't expose details
			case "NOT_FOUND":
				set.status = 404;
				return { error: "Not found" };
			case "PARSE":
				set.status = 400;
				return { error: "Invalid JSON body" };
			default:
				set.status = 500;
				return { error: "Internal server error" }; // Don't expose details
		}
	})

	// Request logging in verbose mode
	.onBeforeHandle(({ request }) => {
		if (config.verbose) {
			console.log(`[Request] ${request.method} ${request.url}`);
		}
	});

// Apply rate limiting if enabled
// Uses Upstash-compatible headers: RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
if (config.rateLimit.enabled) {
	app = app.use(
		rateLimit({
			max: config.rateLimit.max,
			duration: config.rateLimit.windowMs,
			// Upstash-style error response format
			responseMessage: { error: "ERR rate limit exceeded" },
			// Include RateLimit-* headers (enabled by default)
			headers: true,
			skip: (request) => {
				// Skip rate limiting for health checks
				const url = new URL(request.url);
				return url.pathname === "/health";
			},
			generator: (request) => {
				// Use Authorization header for rate limiting key (per-token limiting)
				// Falls back to IP-based limiting if no auth header
				const authHeader = request.headers.get("authorization");
				if (authHeader) {
					// Hash the auth header to avoid storing tokens
					return `auth:${Bun.hash(authHeader)}`;
				}
				// Fallback to IP-based (note: may need X-Forwarded-For in production)
				return request.headers.get("x-forwarded-for") ?? "anonymous";
			},
		})
	);
}

// Apply authentication and command routes
const server = app
	.use(requireAuth)
	.use(commandRoutes)
	// Start server
	.listen(config.port);

const filterSummary = getFilterSummary();
const rateLimitStatus = config.rateLimit.enabled
	? `${config.rateLimit.max} req/${config.rateLimit.windowMs / 1000}s`
	: "Disabled";

console.log(`
╔══════════════════════════════════════════════════════════════╗
║     🚀 Serverless Elysia Redis HTTP                          ║
║     Upstash-compatible REST API for Redis                    ║
╠══════════════════════════════════════════════════════════════╣
║  Server:     http://localhost:${String(config.port).padEnd(5)}                        ║
║  Redis:      ${maskRedisUrl(config.redisUrl).padEnd(45).slice(0, 45)} ║
║  Auth:       ${config.token ? "Enabled (Bearer/Basic)".padEnd(45) : "⚠️  DISABLED (set UPSTASH_TOKEN)".padEnd(45)} ║
║  Verbose:    ${String(config.verbose).padEnd(45)} ║
╠══════════════════════════════════════════════════════════════╣
║  Security:                                                   ║
║    Filter:   ${filterSummary.mode.padEnd(45)} ║
║    Blocked:  ${`${filterSummary.blockedCount} dangerous commands`.padEnd(45)} ║
║    Rate:     ${rateLimitStatus.padEnd(45)} ║
╠══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                  ║
║    POST /              - Execute command from body           ║
║    POST /pipeline      - Execute pipeline                    ║
║    POST /multi-exec    - Execute transaction                 ║
║    GET  /<cmd>/<args>  - Execute command from path           ║
║    GET  /health        - Health check                        ║
╚══════════════════════════════════════════════════════════════╝
`);

// Warn if auth is disabled
if (!config.token) {
	console.warn("⚠️  WARNING: Authentication is disabled! Set UPSTASH_TOKEN to enable.");
}

// Warn if command filtering is disabled
if (config.commandFilterMode === "none") {
	console.warn("⚠️  WARNING: Command filtering is disabled! This is dangerous.");
}

// Warn if rate limiting is disabled
if (!config.rateLimit.enabled) {
	console.warn("⚠️  WARNING: Rate limiting is disabled! Set RATE_LIMIT_ENABLED=true to enable.");
}

// Graceful shutdown
process.on("SIGINT", async () => {
	console.log("\n[Server] Shutting down...");
	await server.stop();
	process.exit(0);
});

process.on("SIGTERM", async () => {
	console.log("\n[Server] Shutting down...");
	await server.stop();
	process.exit(0);
});

export type App = typeof server;
export default server;
