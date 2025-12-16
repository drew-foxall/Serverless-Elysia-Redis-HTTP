/**
 * Upstash Compatibility Tests
 *
 * These tests verify that our response format matches what the @upstash/redis
 * client expects. This ensures drop-in compatibility.
 */

import { describe, expect, it } from "bun:test";
import {
	formatError,
	formatMultipleResults,
	formatSuccess,
	formatTransactionResults,
} from "../utils/parser";
import {
	UpstashResponseFactory,
	isUpstashError,
	isUpstashSuccess,
} from "../types/upstash";

describe("Upstash Response Format Compatibility", () => {
	describe("Success responses", () => {
		it("formats string result correctly", () => {
			const response = formatSuccess("hello");

			expect(response).toHaveProperty("result");
			expect(response.result).toBe("hello");
			expect(response).not.toHaveProperty("error");
		});

		it("formats null result correctly", () => {
			const response = formatSuccess(null);

			expect(response).toHaveProperty("result");
			expect(response.result).toBe(null);
		});

		it("formats number result correctly", () => {
			const response = formatSuccess(42);

			expect(response.result).toBe(42);
		});

		it("formats array result correctly", () => {
			const response = formatSuccess(["a", "b", "c"]);

			expect(response.result).toEqual(["a", "b", "c"]);
		});

		it("formats OK result correctly", () => {
			const response = formatSuccess("OK");

			expect(response.result).toBe("OK");
		});
	});

	describe("Error responses", () => {
		it("formats error string correctly", () => {
			const response = formatError("ERR unknown command");

			expect(response).toHaveProperty("error");
			expect(response.error).toBe("ERR unknown command");
			expect(response).not.toHaveProperty("result");
		});

		it("formats Error object correctly", () => {
			const response = formatError(new Error("Connection failed"));

			expect(response.error).toBe("Connection failed");
		});
	});

	describe("Pipeline responses", () => {
		it("formats successful pipeline correctly", () => {
			const results: Array<[Error | null, unknown]> = [
				[null, "OK"],
				[null, "value"],
				[null, 42],
			];
			const response = formatMultipleResults(results);

			expect(response).toHaveLength(3);
			expect(response[0]).toEqual({ result: "OK" });
			expect(response[1]).toEqual({ result: "value" });
			expect(response[2]).toEqual({ result: 42 });
		});

		it("formats pipeline with errors correctly", () => {
			const results: Array<[Error | null, unknown]> = [
				[null, "OK"],
				[new Error("WRONGTYPE"), null],
				[null, "value"],
			];
			const response = formatMultipleResults(results);

			expect(response).toHaveLength(3);
			expect(response[0]).toEqual({ result: "OK" });
			expect(response[1]).toEqual({ error: "WRONGTYPE" });
			expect(response[2]).toEqual({ result: "value" });
		});
	});

	describe("Transaction responses", () => {
		it("formats transaction results correctly", () => {
			const results = ["OK", 1, 2, "2"];
			const response = formatTransactionResults(results);

			expect(response).toHaveLength(4);
			expect(response[0]).toEqual({ result: "OK" });
			expect(response[1]).toEqual({ result: 1 });
			expect(response[2]).toEqual({ result: 2 });
			expect(response[3]).toEqual({ result: "2" });
		});
	});

	describe("Type guards", () => {
		it("isUpstashError identifies error responses", () => {
			const errorResponse = { error: "Something went wrong" };
			const successResponse = { result: "value" };

			expect(isUpstashError(errorResponse)).toBe(true);
			expect(isUpstashError(successResponse)).toBe(false);
		});

		it("isUpstashSuccess identifies success responses", () => {
			const errorResponse = { error: "Something went wrong" };
			const successResponse = { result: "value" };

			expect(isUpstashSuccess(successResponse)).toBe(true);
			expect(isUpstashSuccess(errorResponse)).toBe(false);
		});
	});

	describe("Response factory", () => {
		it("creates success responses", () => {
			const response = UpstashResponseFactory.success("hello");

			expect(response).toEqual({ result: "hello" });
		});

		it("creates error responses", () => {
			const response = UpstashResponseFactory.error("Failed");

			expect(response).toEqual({ error: "Failed" });
		});

		it("creates null responses", () => {
			const response = UpstashResponseFactory.null();

			expect(response).toEqual({ result: null });
		});

		it("creates OK responses", () => {
			const response = UpstashResponseFactory.ok();

			expect(response).toEqual({ result: "OK" });
		});

		it("creates pipeline responses", () => {
			const response = UpstashResponseFactory.pipeline([
				"OK",
				new Error("Failed"),
				"value",
			]);

			expect(response).toEqual([
				{ result: "OK" },
				{ error: "Failed" },
				{ result: "value" },
			]);
		});
	});
});

describe("@upstash/redis client format expectations", () => {
	/**
	 * These tests document the exact format the @upstash/redis client expects
	 */

	it("GET command expects { result: string | null }", () => {
		// When key exists
		const existsResponse = formatSuccess("myvalue");
		expect(existsResponse.result).toBe("myvalue");

		// When key doesn't exist
		const missingResponse = formatSuccess(null);
		expect(missingResponse.result).toBe(null);
	});

	it("SET command expects { result: 'OK' }", () => {
		const response = formatSuccess("OK");
		expect(response.result).toBe("OK");
	});

	it("INCR command expects { result: number }", () => {
		const response = formatSuccess(42);
		expect(typeof response.result).toBe("number");
	});

	it("DEL command expects { result: number }", () => {
		const response = formatSuccess(3); // Number of keys deleted
		expect(typeof response.result).toBe("number");
	});

	it("EXISTS command expects { result: number }", () => {
		const response = formatSuccess(1);
		expect(response.result).toBe(1);
	});

	it("HGETALL command expects { result: string[] }", () => {
		// Redis returns flat array: [field1, value1, field2, value2, ...]
		const response = formatSuccess(["field1", "value1", "field2", "value2"]);
		expect(Array.isArray(response.result)).toBe(true);
	});

	it("LRANGE command expects { result: string[] }", () => {
		const response = formatSuccess(["item1", "item2", "item3"]);
		expect(Array.isArray(response.result)).toBe(true);
	});

	it("SMEMBERS command expects { result: string[] }", () => {
		const response = formatSuccess(["member1", "member2"]);
		expect(Array.isArray(response.result)).toBe(true);
	});

	it("SCAN command expects { result: [cursor, keys[]] }", () => {
		const response = formatSuccess(["0", ["key1", "key2", "key3"]]);
		expect(Array.isArray(response.result)).toBe(true);
	});

	it("Pipeline expects array of { result } or { error }", () => {
		const response = formatMultipleResults([
			[null, "OK"],
			[null, "value"],
		]);

		expect(Array.isArray(response)).toBe(true);
		expect(response.every((r) => "result" in r || "error" in r)).toBe(true);
	});
});

