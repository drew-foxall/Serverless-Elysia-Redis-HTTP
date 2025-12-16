import { config } from "../config";
import {
	DANGEROUS_COMMANDS,
	SAFE_COMMANDS,
	isDangerousCommand,
	isSafeCommand,
} from "../utils/security";

/**
 * Command filtering errors
 */
export class CommandBlockedError extends Error {
	constructor(command: string, reason: string) {
		super(`Command '${command}' is blocked: ${reason}`);
		this.name = "CommandBlockedError";
	}
}

/**
 * Validate that a command is allowed based on the configured filter mode
 * @param command - The Redis command to validate
 * @throws CommandBlockedError if the command is not allowed
 */
export function validateCommand(command: string): void {
	const cmd = command.toUpperCase();

	switch (config.commandFilterMode) {
		case "blocklist": {
			// Check built-in blocklist
			if (isDangerousCommand(cmd)) {
				throw new CommandBlockedError(cmd, "dangerous command blocked for security");
			}

			// Check additional blocked commands
			if (config.additionalBlockedCommands.includes(cmd)) {
				throw new CommandBlockedError(cmd, "command blocked by configuration");
			}
			break;
		}

		case "allowlist": {
			// Must be in safe list or additional allowed list
			const isAllowed =
				isSafeCommand(cmd) || config.additionalAllowedCommands.includes(cmd);

			if (!isAllowed) {
				throw new CommandBlockedError(cmd, "command not in allowlist");
			}
			break;
		}

		case "none":
			// No filtering - allow all commands (dangerous!)
			break;
	}
}

/**
 * Validate multiple commands (for pipeline/transaction)
 * @param commands - Array of commands to validate
 * @throws CommandBlockedError if any command is not allowed
 */
export function validateCommands(commands: Array<[string, ...unknown[]]>): void {
	for (const [cmd] of commands) {
		validateCommand(cmd);
	}
}

/**
 * Get a summary of the current command filter configuration
 */
export function getFilterSummary(): {
	mode: string;
	blockedCount: number;
	allowedCount: number;
} {
	const baseBlockedCount = DANGEROUS_COMMANDS.size;
	const baseAllowedCount = SAFE_COMMANDS.size;

	return {
		mode: config.commandFilterMode,
		blockedCount:
			config.commandFilterMode === "blocklist"
				? baseBlockedCount + config.additionalBlockedCommands.length
				: 0,
		allowedCount:
			config.commandFilterMode === "allowlist"
				? baseAllowedCount + config.additionalAllowedCommands.length
				: 0,
	};
}

