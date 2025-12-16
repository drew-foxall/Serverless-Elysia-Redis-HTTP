/**
 * Command parsing utilities for Upstash-compatible REST API
 *
 * This module ensures all responses match the Upstash REST API format
 * for compatibility with the @upstash/redis client.
 */

import type {
	CommandArgs,
	ParsedCommand,
	UpstashErrorResponse,
	UpstashPipelineResponse,
	UpstashResponse,
} from "../types/upstash";

// Re-export types for convenience
export type { CommandArgs, ParsedCommand };

/**
 * Parse URL path segments into a Redis command and arguments
 * Handles URL encoding and special characters
 *
 * Example: /GET/mykey -> ["GET", "mykey"]
 * Example: /SET/mykey/myvalue -> ["SET", "mykey", "myvalue"]
 * Example: /HSET/myhash/field1/value1/field2/value2 -> ["HSET", "myhash", "field1", "value1", "field2", "value2"]
 */
export function parsePathCommand(pathSegments: string[]): ParsedCommand {
	if (pathSegments.length === 0) {
		throw new Error("No command provided");
	}

	const [command, ...args] = pathSegments.map((segment) => decodeURIComponent(segment));

	if (!command) {
		throw new Error("Empty command");
	}

	return [command.toUpperCase(), ...args];
}

/**
 * Parse a JSON body into a Redis command
 * Accepts either an array format or object format
 *
 * Array format: ["SET", "key", "value"]
 * Object format: { "command": "SET", "args": ["key", "value"] }
 */
export function parseBodyCommand(body: unknown): ParsedCommand {
	if (Array.isArray(body)) {
		if (body.length === 0) {
			throw new Error("Empty command array");
		}

		const [command, ...args] = body;

		if (typeof command !== "string") {
			throw new Error("Command must be a string");
		}

		// Validate and convert args
		const validatedArgs = args.map((arg) => {
			if (typeof arg === "string" || typeof arg === "number") {
				return arg;
			}
			if (Buffer.isBuffer(arg)) {
				return arg;
			}
			// Convert objects/arrays to JSON strings
			return JSON.stringify(arg);
		});

		return [command.toUpperCase(), ...validatedArgs];
	}

	if (typeof body === "object" && body !== null) {
		const obj = body as Record<string, unknown>;

		if (typeof obj.command === "string") {
			const args = Array.isArray(obj.args) ? obj.args : [];
			return parseBodyCommand([obj.command, ...args]);
		}
	}

	throw new Error("Invalid command format. Expected array or object with command property.");
}

/**
 * Parse multiple commands from a body (for pipeline/transaction)
 *
 * Format: [["SET", "k1", "v1"], ["GET", "k1"]]
 */
export function parseMultipleCommands(body: unknown): ParsedCommand[] {
	if (!Array.isArray(body)) {
		throw new Error("Expected array of commands");
	}

	if (body.length === 0) {
		throw new Error("Empty command array");
	}

	return body.map((cmd, index) => {
		try {
			return parseBodyCommand(cmd);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new Error(`Invalid command at index ${index}: ${message}`);
		}
	});
}

/**
 * Serialize Redis response to match Upstash format
 * Converts various Redis response types to JSON-safe values
 *
 * @see https://docs.upstash.com/redis/features/restapi
 */
export function serializeResult(result: unknown): unknown {
	if (result === null) {
		return null;
	}

	if (result === undefined) {
		return null;
	}

	if (Buffer.isBuffer(result)) {
		// Try to decode as UTF-8 string, fall back to base64
		try {
			return result.toString("utf-8");
		} catch {
			return result.toString("base64");
		}
	}

	if (Array.isArray(result)) {
		return result.map(serializeResult);
	}

	if (typeof result === "bigint") {
		return Number(result);
	}

	// Handle Redis "OK" response
	if (result === "OK") {
		return "OK";
	}

	return result;
}

/**
 * Format a successful response in Upstash format
 *
 * Response format: { "result": <value> }
 */
export function formatSuccess<T>(result: T): UpstashResponse<T> {
	return { result: serializeResult(result) as T };
}

/**
 * Format an error response in Upstash format
 *
 * Response format: { "error": "<message>" }
 */
export function formatError(error: string | Error): UpstashErrorResponse {
	const message = error instanceof Error ? error.message : error;
	return { error: message };
}

/**
 * Format pipeline/transaction results in Upstash format
 *
 * Response format: [{ "result": <value> }, { "error": "<message>" }, ...]
 */
export function formatMultipleResults(
	results: Array<[Error | null, unknown]>
): UpstashPipelineResponse {
	return results.map(([err, value]) => {
		if (err) {
			return formatError(err);
		}
		return formatSuccess(value);
	});
}

/**
 * Format transaction results (all succeed or all fail)
 */
export function formatTransactionResults(results: unknown[]): UpstashPipelineResponse {
	return results.map((value) => formatSuccess(value));
}
