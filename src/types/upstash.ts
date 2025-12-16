/**
 * Types imported from @upstash/redis to ensure API compatibility
 *
 * These types are the ACTUAL types used by the Upstash client library.
 * By re-exporting them, we guarantee our adapter is compatible with
 * the official @upstash/redis client.
 */

// Import the actual types from @upstash/redis
// These are the source of truth for the Upstash REST API format
import type {
	UpstashRequest as _UpstashRequest,
	UpstashResponse as _UpstashResponse,
} from "@upstash/redis";

/**
 * Re-export the core Upstash types
 * These are imported directly from @upstash/redis to ensure compatibility
 */
export type UpstashRequest = _UpstashRequest;
export type UpstashResponse<TResult = unknown> = _UpstashResponse<TResult>;

/**
 * Pipeline response - array of individual command responses
 * This matches how @upstash/redis Pipeline.exec() returns results
 */
export type UpstashPipelineResponse<TResults extends unknown[] = unknown[]> = {
	[K in keyof TResults]: UpstashResponse<TResults[K]>;
};

/**
 * Type guard to check if a response is an error
 */
export function isUpstashError<T>(
	response: UpstashResponse<T>
): response is { result?: undefined; error: string } {
	return response.error !== undefined;
}

/**
 * Type guard to check if a response is successful
 */
export function isUpstashSuccess<T>(
	response: UpstashResponse<T>
): response is { result: T; error?: undefined } {
	return response.error === undefined;
}

/**
 * Common Redis result types for type-safe responses
 * These match the return types used by @upstash/redis commands
 */
export namespace RedisResult {
	/** String commands return string | null */
	export type StringResult = string | null;

	/** Integer commands (INCR, DECR, etc.) return number */
	export type IntegerResult = number;

	/** OK response from commands like SET */
	export type OkResult = "OK";

	/** Boolean-like responses (0 or 1) */
	export type BooleanResult = 0 | 1;

	/** Array results (LRANGE, SMEMBERS, etc.) */
	export type ArrayResult<T = string> = T[];

	/** Hash results from HGETALL */
	export type HashResult = Record<string, string> | string[];

	/** SCAN result format - matches @upstash/redis ScanCommand return type */
	export type ScanResult = [cursor: string, keys: string[]];

	/** HSCAN result format */
	export type HScanResult = [cursor: string, fields: string[]];

	/** Sorted set with scores */
	export type ZSetResult = Array<{ member: string; score: number }>;
}

/**
 * Command argument types for validation
 */
export type CommandArg = string | number | Buffer;
export type CommandArgs = CommandArg[];

/**
 * Parsed command tuple
 */
export type ParsedCommand = [command: string, ...args: CommandArgs];

/**
 * Pipeline command format
 */
export type PipelineCommand = ParsedCommand;
export type PipelineCommands = PipelineCommand[];

/**
 * Response headers that Upstash returns
 * @see https://upstash.com/docs/redis/features/restapi
 */
export type UpstashResponseHeaders = {
	/** Sync token for read-your-writes consistency */
	"upstash-sync-token"?: string;
	/** Rate limit - max requests allowed */
	"RateLimit-Limit"?: string;
	/** Rate limit - remaining requests in current window */
	"RateLimit-Remaining"?: string;
	/** Rate limit - Unix timestamp when limit resets */
	"RateLimit-Reset"?: string;
};

/**
 * Error response with additional metadata
 */
export type UpstashErrorResponse = {
	error: string;
};

/**
 * Factory functions for creating properly typed responses
 * These ensure responses match the exact format @upstash/redis expects
 */
export const UpstashResponseFactory = {
	/**
	 * Create a success response matching UpstashResponse<T> format
	 */
	success<T>(result: T): UpstashResponse<T> {
		return { result };
	},

	/**
	 * Create an error response matching UpstashResponse format
	 */
	error(message: string): UpstashErrorResponse {
		return { error: message };
	},

	/**
	 * Create a pipeline response from an array of results
	 */
	pipeline<T extends unknown[]>(
		results: { [K in keyof T]: T[K] | Error }
	): UpstashPipelineResponse<T> {
		return results.map((result) => {
			if (result instanceof Error) {
				return { error: result.message };
			}
			return { result };
		}) as UpstashPipelineResponse<T>;
	},

	/**
	 * Create a null result (for missing keys)
	 */
	null(): UpstashResponse<null> {
		return { result: null };
	},

	/**
	 * Create an OK result
	 */
	ok(): UpstashResponse<"OK"> {
		return { result: "OK" };
	},
};

/**
 * Type assertion to verify our response format matches Upstash's
 * This is a compile-time check - if this file compiles, our types are compatible
 */
type _AssertResponseCompatibility = UpstashResponse<string> extends { result?: string; error?: string }
	? true
	: never;

// This ensures the assertion is evaluated
const _: _AssertResponseCompatibility = true;
