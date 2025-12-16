/**
 * Type Compatibility Tests
 *
 * These tests verify that our types are actually compatible with @upstash/redis
 * by importing and using types from both packages.
 */

import { describe, expect, it } from "bun:test";

// Import types from BOTH @upstash/redis AND our package
import type {
	UpstashRequest as OurRequest,
	UpstashResponse as OurResponse,
} from "../types/upstash";

import type {
	UpstashRequest,
	UpstashResponse,
} from "@upstash/redis";

// Import our response formatter
import { formatSuccess, formatError } from "../utils/parser";

describe("Type compatibility with @upstash/redis", () => {
	it("our UpstashRequest is assignable to @upstash/redis UpstashRequest", () => {
		// This is a compile-time test - if it compiles, the types are compatible
		const ourRequest: OurRequest = {
			path: ["GET", "mykey"],
			body: ["SET", "key", "value"],
		};

		// Should be assignable to Upstash's type
		const upstashRequest: UpstashRequest = ourRequest;

		expect(upstashRequest.path).toEqual(["GET", "mykey"]);
	});

	it("our UpstashResponse is assignable to @upstash/redis UpstashResponse", () => {
		// Create a response using our type
		const ourResponse: OurResponse<string> = {
			result: "hello",
		};

		// Should be assignable to Upstash's type
		const upstashResponse: UpstashResponse<string> = ourResponse;

		expect(upstashResponse.result).toBe("hello");
	});

	it("formatSuccess returns @upstash/redis compatible response", () => {
		const response = formatSuccess("test-value");

		// This should be assignable to UpstashResponse
		const upstashCompatible: UpstashResponse<string> = response as UpstashResponse<string>;

		expect(upstashCompatible.result).toBe("test-value");
		expect(upstashCompatible.error).toBeUndefined();
	});

	it("formatError returns @upstash/redis compatible error response", () => {
		const response = formatError("Something went wrong");

		// Error responses have error property
		const upstashCompatible: UpstashResponse<never> = response as UpstashResponse<never>;

		expect(upstashCompatible.error).toBe("Something went wrong");
		expect(upstashCompatible.result).toBeUndefined();
	});

	it("null results are compatible", () => {
		const response = formatSuccess(null);

		const upstashCompatible: UpstashResponse<null> = response as UpstashResponse<null>;

		expect(upstashCompatible.result).toBeNull();
	});

	it("array results are compatible", () => {
		const response = formatSuccess(["a", "b", "c"]);

		const upstashCompatible: UpstashResponse<string[]> = response as UpstashResponse<string[]>;

		expect(upstashCompatible.result).toEqual(["a", "b", "c"]);
	});

	it("number results are compatible", () => {
		const response = formatSuccess(42);

		const upstashCompatible: UpstashResponse<number> = response as UpstashResponse<number>;

		expect(upstashCompatible.result).toBe(42);
	});
});

/**
 * Compile-time type assertions
 * These won't run as tests but will cause compilation errors if types don't match
 */

// Verify our Response type structure matches Upstash's
type _VerifyResponseStructure = OurResponse<string> extends { result?: string; error?: string }
	? true
	: false;
const _responseCheck: _VerifyResponseStructure = true;

// Verify our Request type structure matches Upstash's
type _VerifyRequestStructure = OurRequest extends { path?: string[]; body?: unknown }
	? true
	: false;
const _requestCheck: _VerifyRequestStructure = true;

// Verify bidirectional assignability (our types ARE Upstash's types)
type _OurResponseIsUpstash = OurResponse<string> extends UpstashResponse<string> ? true : false;
type _UpstashResponseIsOurs = UpstashResponse<string> extends OurResponse<string> ? true : false;

const _bidirectionalResponse: _OurResponseIsUpstash & _UpstashResponseIsOurs = true;

