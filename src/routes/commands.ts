import { Elysia } from "elysia";
import { config } from "../config";
import { CommandBlockedError, validateCommand, validateCommands } from "../middleware/command-filter";
import { redisClient } from "../redis/client";
import {
	CommandArraySchema,
	PathCommandBodySchema,
	PipelineSchema,
	SingleCommandSchema,
} from "../schemas/command";
import {
	formatError,
	formatMultipleResults,
	formatSuccess,
	parseBodyCommand,
	parseMultipleCommands,
	parsePathCommand,
} from "../utils/parser";

/**
 * Command routes that implement the Upstash-compatible REST API
 *
 * Upstash API supports:
 * 1. Path-based commands: GET /GET/mykey, POST /SET/mykey/myvalue
 * 2. Body-based commands: POST / with body ["SET", "key", "value"]
 * 3. Pipeline: POST /pipeline with body [["SET", "k1", "v1"], ["GET", "k1"]]
 * 4. Transaction: POST /multi-exec with same format as pipeline
 */
export const commandRoutes = new Elysia({ name: "commands" })
	// Health check endpoint (intentionally before auth for load balancer health checks)
	.get("/health", () => ({ status: "ok", timestamp: Date.now() }))

	/**
	 * POST / - Execute command from body
	 * Body format: ["COMMAND", "arg1", "arg2", ...] or { command: "CMD", args: [...] }
	 */
	.post(
		"/",
		async ({ body, set }) => {
			try {
				const [command, ...args] = parseBodyCommand(body);

				// Validate command is allowed
				validateCommand(command);

				const result = await redisClient.execute(command, args);
				return formatSuccess(result);
			} catch (error) {
				const err = error as Error;

				if (err instanceof CommandBlockedError) {
					set.status = 403;
					return formatError(err.message);
				}

				set.status = 400;
				return formatError(err);
			}
		},
		{
			body: SingleCommandSchema,
		}
	)

	/**
	 * POST /pipeline - Execute multiple commands in a pipeline
	 * Body format: [["CMD1", "arg1"], ["CMD2", "arg1", "arg2"], ...]
	 */
	.post(
		"/pipeline",
		async ({ body, set }) => {
			try {
				const commands = parseMultipleCommands(body);

				// Validate all commands are allowed
				validateCommands(commands);

				const results = await redisClient.pipeline(commands);
				return formatMultipleResults(results);
			} catch (error) {
				const err = error as Error;

				if (err instanceof CommandBlockedError) {
					set.status = 403;
					return formatError(err.message);
				}

				set.status = 400;
				return formatError(err);
			}
		},
		{
			body: PipelineSchema,
		}
	)

	/**
	 * POST /multi-exec - Execute multiple commands in a transaction
	 * Body format: [["CMD1", "arg1"], ["CMD2", "arg1", "arg2"], ...]
	 */
	.post(
		"/multi-exec",
		async ({ body, set }) => {
			try {
				const commands = parseMultipleCommands(body);

				// Validate all commands are allowed
				validateCommands(commands);

				const results = await redisClient.transaction(commands);
				return results.map((result) => formatSuccess(result));
			} catch (error) {
				const err = error as Error;

				if (err instanceof CommandBlockedError) {
					set.status = 403;
					return formatError(err.message);
				}

				set.status = 400;
				return formatError(err);
			}
		},
		{
			body: PipelineSchema,
		}
	)

	/**
	 * Catch-all route for path-based commands
	 * Format: /COMMAND/arg1/arg2/arg3...
	 *
	 * Examples:
	 * - GET /get/mykey -> GET mykey
	 * - GET /hget/myhash/myfield -> HGET myhash myfield
	 * - GET /set/mykey/myvalue -> SET mykey myvalue
	 * - POST /set/mykey/myvalue -> SET mykey myvalue
	 */
	.all(
		"/*",
		async ({ body, request, set }) => {
			try {
				// Get the path and split into segments
				const url = new URL(request.url);
				const pathSegments = url.pathname
					.split("/")
					.filter((segment) => segment.length > 0);

				if (pathSegments.length === 0) {
					set.status = 400;
					return formatError("No command provided");
				}

				let command: string;
				let args: (string | number | Buffer)[];

				// If body is provided as array, use that as args
				if (Array.isArray(body) && body.length > 0) {
					// Path provides command, body provides args
					command = pathSegments[0].toUpperCase();
					args = body.map((arg) => {
						if (typeof arg === "string" || typeof arg === "number") {
							return arg;
						}
						if (arg === null || arg === undefined) {
							return "";
						}
						return JSON.stringify(arg);
					});
				} else if (body && typeof body === "object" && !Array.isArray(body)) {
					// POST with JSON body containing command
					const parsed = parseBodyCommand(body);
					command = parsed[0];
					args = parsed.slice(1);
				} else {
					// Use path segments as command and args
					const parsed = parsePathCommand(pathSegments);
					command = parsed[0];
					args = parsed.slice(1);
				}

				// Validate command is allowed
				validateCommand(command);

				if (config.verbose) {
					console.log(`[Command] ${command} ${args.join(" ")}`);
				}

				const result = await redisClient.execute(command, args);
				return formatSuccess(result);
			} catch (error) {
				const err = error as Error;

				if (err instanceof CommandBlockedError) {
					set.status = 403;
					return formatError(err.message);
				}

				// Handle Redis command errors - sanitize message
				if (err.message.includes("ERR") || err.message.includes("WRONGTYPE")) {
					set.status = 400;
					// Return a sanitized error message
					return formatError("Redis command error");
				}

				set.status = 500;
				return formatError("Internal server error");
			}
		},
		{
			body: PathCommandBodySchema,
		}
	);
