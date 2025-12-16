import { t } from "elysia";

/**
 * Validation schemas for Redis command inputs
 *
 * These schemas provide runtime validation to ensure request bodies
 * match the expected format before processing.
 */

/**
 * A single command argument can be a string or number
 * Note: Buffers are handled internally after JSON parsing
 */
const CommandArg = t.Union([t.String(), t.Number(), t.Boolean(), t.Null()]);

/**
 * Array of command arguments
 */
const CommandArgs = t.Array(CommandArg);

/**
 * A Redis command in array format: ["COMMAND", "arg1", "arg2", ...]
 * The first element must be a string (the command name)
 */
export const CommandArraySchema = t.Array(t.Union([t.String(), t.Number(), t.Boolean(), t.Null()]), {
	minItems: 1,
	error: "Command must be a non-empty array with command name as first element",
});

/**
 * A Redis command in object format: { command: "SET", args: ["key", "value"] }
 */
export const CommandObjectSchema = t.Object({
	command: t.String({ minLength: 1, error: "Command name is required" }),
	args: t.Optional(CommandArgs),
});

/**
 * Single command body - accepts either array or object format
 */
export const SingleCommandSchema = t.Union([CommandArraySchema, CommandObjectSchema], {
	error: "Invalid command format. Expected array like ['SET', 'key', 'value'] or object like { command: 'SET', args: ['key', 'value'] }",
});

/**
 * Pipeline/Transaction body - array of commands
 */
export const PipelineSchema = t.Array(CommandArraySchema, {
	minItems: 1,
	error: "Pipeline must be a non-empty array of commands",
});

/**
 * Path-based command with optional body args
 * When a body is provided with a path command, it contains the arguments
 */
export const PathCommandBodySchema = t.Optional(
	t.Union([
		CommandArgs,
		CommandObjectSchema,
		t.Undefined(),
		t.Null(),
	])
);

/**
 * Validate that the first element of a command array is a string
 */
export function validateCommandArray(arr: unknown[]): arr is [string, ...unknown[]] {
	return arr.length > 0 && typeof arr[0] === "string";
}

