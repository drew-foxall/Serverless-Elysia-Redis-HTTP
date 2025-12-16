import { describe, expect, it } from "bun:test";
import {
	formatError,
	formatSuccess,
	parseBodyCommand,
	parseMultipleCommands,
	parsePathCommand,
	serializeResult,
} from "../utils/parser";

describe("parsePathCommand", () => {
	it("parses simple GET command", () => {
		const result = parsePathCommand(["GET", "mykey"]);
		expect(result).toEqual(["GET", "mykey"]);
	});

	it("parses SET command with value", () => {
		const result = parsePathCommand(["SET", "mykey", "myvalue"]);
		expect(result).toEqual(["SET", "mykey", "myvalue"]);
	});

	it("parses HSET command with multiple args", () => {
		const result = parsePathCommand(["HSET", "myhash", "field1", "value1"]);
		expect(result).toEqual(["HSET", "myhash", "field1", "value1"]);
	});

	it("normalizes command to uppercase", () => {
		const result = parsePathCommand(["get", "mykey"]);
		expect(result).toEqual(["GET", "mykey"]);
	});

	it("decodes URL-encoded values", () => {
		const result = parsePathCommand(["SET", "my%20key", "hello%20world"]);
		expect(result).toEqual(["SET", "my key", "hello world"]);
	});

	it("throws on empty segments", () => {
		expect(() => parsePathCommand([])).toThrow("No command provided");
	});
});

describe("parseBodyCommand", () => {
	it("parses array format", () => {
		const result = parseBodyCommand(["SET", "key", "value"]);
		expect(result).toEqual(["SET", "key", "value"]);
	});

	it("handles numeric arguments", () => {
		const result = parseBodyCommand(["EXPIRE", "key", 3600]);
		expect(result).toEqual(["EXPIRE", "key", 3600]);
	});

	it("normalizes command to uppercase", () => {
		const result = parseBodyCommand(["set", "key", "value"]);
		expect(result).toEqual(["SET", "key", "value"]);
	});

	it("parses object format", () => {
		const result = parseBodyCommand({ command: "SET", args: ["key", "value"] });
		expect(result).toEqual(["SET", "key", "value"]);
	});

	it("throws on empty array", () => {
		expect(() => parseBodyCommand([])).toThrow("Empty command array");
	});

	it("throws on invalid format", () => {
		expect(() => parseBodyCommand("invalid")).toThrow("Invalid command format");
	});

	it("converts objects in args to JSON strings", () => {
		const result = parseBodyCommand(["SET", "key", { nested: "object" }]);
		expect(result).toEqual(["SET", "key", '{"nested":"object"}']);
	});
});

describe("parseMultipleCommands", () => {
	it("parses pipeline commands", () => {
		const result = parseMultipleCommands([
			["SET", "k1", "v1"],
			["GET", "k1"],
		]);
		expect(result).toEqual([
			["SET", "k1", "v1"],
			["GET", "k1"],
		]);
	});

	it("throws on empty array", () => {
		expect(() => parseMultipleCommands([])).toThrow("Empty command array");
	});

	it("throws on non-array input", () => {
		expect(() => parseMultipleCommands("not an array")).toThrow("Expected array of commands");
	});

	it("throws with index on invalid command", () => {
		expect(() => parseMultipleCommands([["SET", "k1", "v1"], "invalid"])).toThrow(
			"Invalid command at index 1"
		);
	});
});

describe("serializeResult", () => {
	it("returns null for null", () => {
		expect(serializeResult(null)).toBe(null);
	});

	it("returns null for undefined", () => {
		expect(serializeResult(undefined)).toBe(null);
	});

	it("converts buffers to strings", () => {
		const buffer = Buffer.from("hello");
		expect(serializeResult(buffer)).toBe("hello");
	});

	it("serializes arrays recursively", () => {
		const result = serializeResult(["a", null, "b"]);
		expect(result).toEqual(["a", null, "b"]);
	});

	it("converts bigint to number", () => {
		expect(serializeResult(BigInt(42))).toBe(42);
	});

	it("passes through OK response", () => {
		expect(serializeResult("OK")).toBe("OK");
	});

	it("passes through numbers", () => {
		expect(serializeResult(123)).toBe(123);
	});
});

describe("formatSuccess", () => {
	it("wraps result in object", () => {
		expect(formatSuccess("value")).toEqual({ result: "value" });
	});

	it("serializes complex results", () => {
		expect(formatSuccess([1, 2, 3])).toEqual({ result: [1, 2, 3] });
	});
});

describe("formatError", () => {
	it("formats string error", () => {
		expect(formatError("Something went wrong")).toEqual({ error: "Something went wrong" });
	});

	it("formats Error object", () => {
		expect(formatError(new Error("Test error"))).toEqual({ error: "Test error" });
	});
});

