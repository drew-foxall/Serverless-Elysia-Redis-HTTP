import { timingSafeEqual } from "node:crypto";

/**
 * Security utilities for the Redis HTTP adapter
 */

/**
 * List of dangerous Redis commands that should be blocked by default
 * These commands can:
 * - Destroy data (FLUSHALL, FLUSHDB)
 * - Reconfigure the server (CONFIG, ACL)
 * - Execute arbitrary code (EVAL, EVALSHA, SCRIPT, MODULE, FUNCTION)
 * - Cause denial of service (SHUTDOWN, DEBUG, SLOWLOG)
 * - Exfiltrate data (MIGRATE, SLAVEOF, REPLICAOF)
 * - Disrupt operations (CLIENT KILL, CLUSTER)
 */
export const DANGEROUS_COMMANDS = new Set([
	// Data destruction
	"FLUSHALL",
	"FLUSHDB",

	// Server configuration
	"CONFIG",
	"ACL",
	"BGREWRITEAOF",
	"BGSAVE",
	"SAVE",

	// Scripting (arbitrary code execution)
	"EVAL",
	"EVALSHA",
	"EVALSHA_RO",
	"EVAL_RO",
	"SCRIPT",
	"FUNCTION",
	"FCALL",
	"FCALL_RO",

	// Module loading (arbitrary code)
	"MODULE",

	// Server control
	"SHUTDOWN",
	"DEBUG",
	"SLOWLOG",

	// Replication (data exfiltration)
	"SLAVEOF",
	"REPLICAOF",
	"MIGRATE",
	"RESTORE",
	"DUMP",

	// Cluster manipulation
	"CLUSTER",
	"READONLY",
	"READWRITE",

	// Client manipulation
	"CLIENT",

	// Potentially dangerous key operations
	"KEYS", // Can cause performance issues with large datasets
	"OBJECT",
	"MEMORY",

	// Pub/Sub management (can disrupt messaging)
	"PUNSUBSCRIBE",
	"UNSUBSCRIBE",

	// Latency monitoring
	"LATENCY",

	// Monitor mode (can capture all commands)
	"MONITOR",
]);

/**
 * Commands that are always safe to allow (whitelist approach alternative)
 */
export const SAFE_COMMANDS = new Set([
	// String operations
	"GET",
	"SET",
	"SETNX",
	"SETEX",
	"PSETEX",
	"MGET",
	"MSET",
	"MSETNX",
	"INCR",
	"INCRBY",
	"INCRBYFLOAT",
	"DECR",
	"DECRBY",
	"APPEND",
	"STRLEN",
	"GETRANGE",
	"SETRANGE",
	"GETSET",
	"GETEX",
	"GETDEL",

	// Hash operations
	"HGET",
	"HSET",
	"HSETNX",
	"HMGET",
	"HMSET",
	"HGETALL",
	"HDEL",
	"HEXISTS",
	"HINCRBY",
	"HINCRBYFLOAT",
	"HKEYS",
	"HVALS",
	"HLEN",
	"HSCAN",
	"HRANDFIELD",

	// List operations
	"LPUSH",
	"RPUSH",
	"LPUSHX",
	"RPUSHX",
	"LPOP",
	"RPOP",
	"LRANGE",
	"LLEN",
	"LINDEX",
	"LSET",
	"LINSERT",
	"LREM",
	"LTRIM",
	"BLPOP",
	"BRPOP",
	"LPOS",
	"LMOVE",
	"BLMOVE",

	// Set operations
	"SADD",
	"SREM",
	"SMEMBERS",
	"SISMEMBER",
	"SMISMEMBER",
	"SCARD",
	"SUNION",
	"SINTER",
	"SDIFF",
	"SUNIONSTORE",
	"SINTERSTORE",
	"SDIFFSTORE",
	"SPOP",
	"SRANDMEMBER",
	"SMOVE",
	"SSCAN",
	"SINTERCARD",

	// Sorted set operations
	"ZADD",
	"ZREM",
	"ZRANGE",
	"ZRANGEBYSCORE",
	"ZRANGEBYLEX",
	"ZREVRANGE",
	"ZREVRANGEBYSCORE",
	"ZREVRANGEBYLEX",
	"ZSCORE",
	"ZMSCORE",
	"ZCARD",
	"ZCOUNT",
	"ZLEXCOUNT",
	"ZINCRBY",
	"ZRANK",
	"ZREVRANK",
	"ZUNIONSTORE",
	"ZINTERSTORE",
	"ZSCAN",
	"ZPOPMIN",
	"ZPOPMAX",
	"BZPOPMIN",
	"BZPOPMAX",
	"ZRANDMEMBER",
	"ZRANGESTORE",
	"ZMPOP",
	"BZMPOP",
	"ZINTER",
	"ZUNION",
	"ZDIFF",
	"ZDIFFSTORE",
	"ZINTERCARD",

	// Key operations
	"DEL",
	"UNLINK",
	"EXISTS",
	"EXPIRE",
	"EXPIREAT",
	"PEXPIRE",
	"PEXPIREAT",
	"EXPIRETIME",
	"PEXPIRETIME",
	"TTL",
	"PTTL",
	"PERSIST",
	"TYPE",
	"RENAME",
	"RENAMENX",
	"SCAN",
	"SORT",
	"SORT_RO",
	"TOUCH",
	"COPY",

	// Server info (read-only, safe)
	"PING",
	"ECHO",
	"INFO",
	"DBSIZE",
	"TIME",

	// Transactions (safe, handled internally)
	"MULTI",
	"EXEC",
	"DISCARD",
	"WATCH",
	"UNWATCH",

	// Pub/Sub (publishing is safe)
	"PUBLISH",
	"PUBSUB",

	// Streams
	"XADD",
	"XREAD",
	"XRANGE",
	"XREVRANGE",
	"XLEN",
	"XTRIM",
	"XDEL",
	"XGROUP",
	"XREADGROUP",
	"XACK",
	"XCLAIM",
	"XAUTOCLAIM",
	"XPENDING",
	"XINFO",
	"XSETID",

	// HyperLogLog
	"PFADD",
	"PFCOUNT",
	"PFMERGE",

	// Geo
	"GEOADD",
	"GEODIST",
	"GEOHASH",
	"GEOPOS",
	"GEORADIUS",
	"GEORADIUSBYMEMBER",
	"GEOSEARCH",
	"GEOSEARCHSTORE",

	// Bitmap
	"SETBIT",
	"GETBIT",
	"BITCOUNT",
	"BITOP",
	"BITPOS",
	"BITFIELD",
	"BITFIELD_RO",

	// JSON (RedisJSON module - safe operations)
	"JSON.GET",
	"JSON.SET",
	"JSON.DEL",
	"JSON.MGET",
	"JSON.TYPE",
	"JSON.NUMINCRBY",
	"JSON.STRAPPEND",
	"JSON.STRLEN",
	"JSON.ARRAPPEND",
	"JSON.ARRINDEX",
	"JSON.ARRINSERT",
	"JSON.ARRLEN",
	"JSON.ARRPOP",
	"JSON.ARRTRIM",
	"JSON.OBJKEYS",
	"JSON.OBJLEN",
]);

/**
 * Check if a command is dangerous
 * @param command - The Redis command to check
 * @returns true if the command is dangerous
 */
export function isDangerousCommand(command: string): boolean {
	return DANGEROUS_COMMANDS.has(command.toUpperCase());
}

/**
 * Check if a command is in the safe whitelist
 * @param command - The Redis command to check
 * @returns true if the command is explicitly safe
 */
export function isSafeCommand(command: string): boolean {
	return SAFE_COMMANDS.has(command.toUpperCase());
}

/**
 * Timing-safe string comparison to prevent timing attacks
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal
 */
export function secureCompare(a: string, b: string): boolean {
	// If lengths differ, we still need to do a comparison to avoid timing leak
	// Pad shorter string to match length
	const aBuffer = Buffer.from(a);
	const bBuffer = Buffer.from(b);

	// If lengths are different, the comparison will fail anyway
	// but we do constant-time comparison to avoid length-based timing leaks
	if (aBuffer.length !== bBuffer.length) {
		// Compare against itself to maintain constant time
		timingSafeEqual(aBuffer, aBuffer);
		return false;
	}

	return timingSafeEqual(aBuffer, bBuffer);
}

/**
 * Mask sensitive parts of a URL (for logging)
 * @param url - The URL to mask
 * @returns Masked URL safe for logging
 */
export function maskRedisUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const hadPassword = !!parsed.password;
		if (parsed.password) {
			parsed.password = "****";
		}
		if (parsed.username && parsed.username !== "default") {
			parsed.username = "****";
		}
		let result = parsed.toString();
		// Remove trailing slash if the original didn't have one and no path
		if (!url.endsWith("/") && result.endsWith("/") && parsed.pathname === "/") {
			result = result.slice(0, -1);
		}
		return result;
	} catch {
		// If URL parsing fails, aggressively mask potential credentials
		// Match patterns like :password@ or user:password@
		return url
			.replace(/:([^@/:]+)@/g, ":****@")
			.replace(/\/\/([^:@]+):([^@]+)@/g, "//****:****@");
	}
}

