/**
 * Type definitions for the Upstash-compatible Redis HTTP adapter
 */

// Re-export all Upstash-compatible types
export * from "./upstash";

// Export type aliases for common use cases
export type {
	CommandArgs,
	ParsedCommand,
	PipelineCommand,
	PipelineCommands,
	RedisResult,
	UpstashErrorResponse,
	UpstashPipelineResponse,
	UpstashRequest,
	UpstashResponse,
	UpstashResponseHeaders,
} from "./upstash";

