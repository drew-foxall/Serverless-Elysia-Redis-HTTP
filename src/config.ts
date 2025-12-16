/**
 * Configuration for the serverless-elysia-redis-http adapter
 */

export type CommandFilterMode = "blocklist" | "allowlist" | "none";

export interface RateLimitConfig {
	/** Enable rate limiting */
	enabled: boolean;
	/** Maximum requests per window */
	max: number;
	/** Time window in milliseconds */
	windowMs: number;
}

export interface RedisPoolConfig {
	/** Enable connection pooling (creates multiple connections) */
	enabled: boolean;
	/** Minimum connections to maintain */
	min: number;
	/** Maximum connections allowed */
	max: number;
}

export interface RedisClusterConfig {
	/** Enable cluster mode */
	enabled: boolean;
	/** Cluster node URLs (comma-separated) */
	nodes: string[];
	/** Scale reads to replicas */
	scaleReads: "master" | "slave" | "all";
}

export interface Config {
	/** Redis connection URL (e.g., redis://localhost:6379) */
	redisUrl: string;
	/** Port to run the HTTP server on */
	port: number;
	/** Optional authentication token for API access */
	token?: string;
	/** Enable verbose logging */
	verbose: boolean;
	/** Maximum request body size in bytes */
	maxBodySize: number;
	/** Redis connection timeout in milliseconds */
	connectionTimeout: number;
	/** Redis command timeout in milliseconds */
	commandTimeout: number;
	/**
	 * Command filtering mode:
	 * - "blocklist": Block dangerous commands (default, recommended)
	 * - "allowlist": Only allow explicitly safe commands (most restrictive)
	 * - "none": Allow all commands (dangerous, not recommended)
	 */
	commandFilterMode: CommandFilterMode;
	/** Custom list of additional commands to block (when using blocklist mode) */
	additionalBlockedCommands: string[];
	/** Custom list of additional commands to allow (when using allowlist mode) */
	additionalAllowedCommands: string[];
	/** Rate limiting configuration */
	rateLimit: RateLimitConfig;
	/** Connection pool configuration */
	pool: RedisPoolConfig;
	/** Redis Cluster configuration */
	cluster: RedisClusterConfig;
}

export function loadConfig(): Config {
	const additionalBlocked = process.env.BLOCKED_COMMANDS?.split(",").map((c) => c.trim()) ?? [];
	const additionalAllowed = process.env.ALLOWED_COMMANDS?.split(",").map((c) => c.trim()) ?? [];

	let commandFilterMode: CommandFilterMode = "blocklist";
	if (process.env.COMMAND_FILTER_MODE === "allowlist") {
		commandFilterMode = "allowlist";
	} else if (process.env.COMMAND_FILTER_MODE === "none") {
		commandFilterMode = "none";
	}

	// Rate limiting config
	const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== "false"; // Enabled by default
	const rateLimitMax = Number.parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10);
	const rateLimitWindowMs = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10); // 1 minute

	// Connection pool config
	const poolEnabled = process.env.REDIS_POOL_ENABLED === "true";
	const poolMin = Number.parseInt(process.env.REDIS_POOL_MIN ?? "2", 10);
	const poolMax = Number.parseInt(process.env.REDIS_POOL_MAX ?? "10", 10);

	// Cluster config
	const clusterEnabled = process.env.REDIS_CLUSTER_ENABLED === "true";
	const clusterNodes = process.env.REDIS_CLUSTER_NODES?.split(",").map((n) => n.trim()).filter(Boolean) ?? [];
	const scaleReads = (process.env.REDIS_CLUSTER_SCALE_READS as "master" | "slave" | "all") ?? "master";

	return {
		redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
		port: Number.parseInt(process.env.PORT ?? "8080", 10),
		token: process.env.UPSTASH_TOKEN ?? process.env.TOKEN,
		verbose: process.env.VERBOSE === "true" || process.env.VERBOSE === "1",
		maxBodySize: Number.parseInt(process.env.MAX_BODY_SIZE ?? "1048576", 10), // 1MB default (safer)
		connectionTimeout: Number.parseInt(process.env.CONNECTION_TIMEOUT ?? "5000", 10),
		commandTimeout: Number.parseInt(process.env.COMMAND_TIMEOUT ?? "30000", 10),
		commandFilterMode,
		additionalBlockedCommands: additionalBlocked,
		additionalAllowedCommands: additionalAllowed,
		rateLimit: {
			enabled: rateLimitEnabled,
			max: rateLimitMax,
			windowMs: rateLimitWindowMs,
		},
		pool: {
			enabled: poolEnabled,
			min: poolMin,
			max: poolMax,
		},
		cluster: {
			enabled: clusterEnabled,
			nodes: clusterNodes,
			scaleReads: scaleReads,
		},
	};
}

export const config = loadConfig();
