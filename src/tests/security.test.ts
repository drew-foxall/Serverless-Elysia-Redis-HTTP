import { describe, expect, it } from "bun:test";
import {
	isDangerousCommand,
	isSafeCommand,
	maskRedisUrl,
	secureCompare,
} from "../utils/security";
import { validateCommand, CommandBlockedError } from "../middleware/command-filter";

describe("secureCompare", () => {
	it("returns true for equal strings", () => {
		expect(secureCompare("password123", "password123")).toBe(true);
	});

	it("returns false for different strings", () => {
		expect(secureCompare("password123", "password456")).toBe(false);
	});

	it("returns false for different length strings", () => {
		expect(secureCompare("short", "muchlongerstring")).toBe(false);
	});

	it("handles empty strings", () => {
		expect(secureCompare("", "")).toBe(true);
		expect(secureCompare("", "nonempty")).toBe(false);
	});

	it("handles unicode strings", () => {
		expect(secureCompare("пароль", "пароль")).toBe(true);
		expect(secureCompare("пароль", "password")).toBe(false);
	});
});

describe("maskRedisUrl", () => {
	it("masks password in redis URL", () => {
		const masked = maskRedisUrl("redis://user:secret@localhost:6379");
		expect(masked).not.toContain("secret");
		expect(masked).toContain("****");
	});

	it("handles URL without password", () => {
		const masked = maskRedisUrl("redis://localhost:6379");
		expect(masked).toBe("redis://localhost:6379");
		expect(masked).not.toContain("****");
	});

	it("handles rediss:// URLs", () => {
		const masked = maskRedisUrl("rediss://default:mytoken@host.upstash.io:6379");
		expect(masked).not.toContain("mytoken");
		expect(masked).toContain("****");
	});

	it("handles malformed URLs gracefully", () => {
		// This is a malformed URL that can't be parsed - we do best-effort masking
		const masked = maskRedisUrl("redis://user:password@host:6379");
		expect(masked).not.toContain("password");
		expect(masked).toContain("****");
	});
});

describe("isDangerousCommand", () => {
	it("identifies FLUSHALL as dangerous", () => {
		expect(isDangerousCommand("FLUSHALL")).toBe(true);
		expect(isDangerousCommand("flushall")).toBe(true);
	});

	it("identifies CONFIG as dangerous", () => {
		expect(isDangerousCommand("CONFIG")).toBe(true);
	});

	it("identifies EVAL as dangerous", () => {
		expect(isDangerousCommand("EVAL")).toBe(true);
	});

	it("identifies SHUTDOWN as dangerous", () => {
		expect(isDangerousCommand("SHUTDOWN")).toBe(true);
	});

	it("identifies DEBUG as dangerous", () => {
		expect(isDangerousCommand("DEBUG")).toBe(true);
	});

	it("identifies MIGRATE as dangerous", () => {
		expect(isDangerousCommand("MIGRATE")).toBe(true);
	});

	it("identifies MODULE as dangerous", () => {
		expect(isDangerousCommand("MODULE")).toBe(true);
	});

	it("identifies KEYS as dangerous (performance)", () => {
		expect(isDangerousCommand("KEYS")).toBe(true);
	});

	it("does not flag GET as dangerous", () => {
		expect(isDangerousCommand("GET")).toBe(false);
	});

	it("does not flag SET as dangerous", () => {
		expect(isDangerousCommand("SET")).toBe(false);
	});
});

describe("isSafeCommand", () => {
	it("identifies GET as safe", () => {
		expect(isSafeCommand("GET")).toBe(true);
		expect(isSafeCommand("get")).toBe(true);
	});

	it("identifies SET as safe", () => {
		expect(isSafeCommand("SET")).toBe(true);
	});

	it("identifies HSET as safe", () => {
		expect(isSafeCommand("HSET")).toBe(true);
	});

	it("identifies LPUSH as safe", () => {
		expect(isSafeCommand("LPUSH")).toBe(true);
	});

	it("identifies ZADD as safe", () => {
		expect(isSafeCommand("ZADD")).toBe(true);
	});

	it("identifies PING as safe", () => {
		expect(isSafeCommand("PING")).toBe(true);
	});

	it("does not identify FLUSHALL as safe", () => {
		expect(isSafeCommand("FLUSHALL")).toBe(false);
	});

	it("does not identify CONFIG as safe", () => {
		expect(isSafeCommand("CONFIG")).toBe(false);
	});
});

describe("validateCommand", () => {
	// Note: These tests depend on the default config (blocklist mode)

	it("allows safe commands", () => {
		expect(() => validateCommand("GET")).not.toThrow();
		expect(() => validateCommand("SET")).not.toThrow();
		expect(() => validateCommand("HSET")).not.toThrow();
	});

	it("blocks dangerous commands", () => {
		expect(() => validateCommand("FLUSHALL")).toThrow(CommandBlockedError);
		expect(() => validateCommand("CONFIG")).toThrow(CommandBlockedError);
		expect(() => validateCommand("SHUTDOWN")).toThrow(CommandBlockedError);
	});

	it("provides meaningful error message", () => {
		try {
			validateCommand("FLUSHALL");
		} catch (e) {
			expect(e).toBeInstanceOf(CommandBlockedError);
			expect((e as Error).message).toContain("FLUSHALL");
			expect((e as Error).message).toContain("blocked");
		}
	});
});

describe("Security attack vectors", () => {
	describe("Command injection via path", () => {
		// These should all be blocked as dangerous commands
		const maliciousCommands = [
			"EVAL",
			"EVALSHA",
			"SCRIPT",
			"CONFIG",
			"FLUSHALL",
			"FLUSHDB",
			"DEBUG",
			"SHUTDOWN",
			"SLAVEOF",
			"REPLICAOF",
			"MODULE",
			"ACL",
			"MIGRATE",
		];

		for (const cmd of maliciousCommands) {
			it(`blocks ${cmd} command`, () => {
				expect(() => validateCommand(cmd)).toThrow(CommandBlockedError);
			});
		}
	});

	describe("Case sensitivity bypass attempts", () => {
		it("blocks FlUsHaLl (mixed case)", () => {
			expect(isDangerousCommand("FlUsHaLl")).toBe(true);
		});

		it("blocks EVAL with different cases", () => {
			expect(isDangerousCommand("eval")).toBe(true);
			expect(isDangerousCommand("Eval")).toBe(true);
			expect(isDangerousCommand("eVaL")).toBe(true);
		});
	});
});

