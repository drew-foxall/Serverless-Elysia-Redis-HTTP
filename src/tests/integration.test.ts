import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { commandRoutes } from "../routes/commands";

/**
 * Integration tests for the Upstash-compatible REST API
 *
 * These tests require a running Redis instance at REDIS_URL (default: redis://localhost:6379)
 * Run with: REDIS_URL=redis://localhost:6379 bun test src/tests/integration.test.ts
 *
 * To skip these tests when Redis is not available, set SKIP_INTEGRATION=true
 */

const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION === "true" || !process.env.REDIS_URL;

describe.skipIf(SKIP_INTEGRATION)("Integration Tests", () => {
	let app: Elysia;

	beforeAll(() => {
		// Create test app without auth for simplicity
		app = new Elysia().use(commandRoutes);
	});

	afterAll(async () => {
		await app.stop();
	});

	describe("Health Check", () => {
		it("returns ok status", async () => {
			const response = await app.handle(new Request("http://localhost/health"));
			const json = await response.json();

			expect(response.status).toBe(200);
			expect(json.status).toBe("ok");
			expect(json.timestamp).toBeDefined();
		});
	});

	describe("POST / - Body Commands", () => {
		it("executes PING command", async () => {
			const response = await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["PING"]),
				})
			);
			const json = await response.json();

			expect(response.status).toBe(200);
			expect(json.result).toBe("PONG");
		});

		it("executes SET and GET commands", async () => {
			// SET
			const setResponse = await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["SET", "test:key", "test-value"]),
				})
			);
			const setJson = await setResponse.json();
			expect(setJson.result).toBe("OK");

			// GET
			const getResponse = await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["GET", "test:key"]),
				})
			);
			const getJson = await getResponse.json();
			expect(getJson.result).toBe("test-value");

			// Cleanup
			await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["DEL", "test:key"]),
				})
			);
		});

		it("handles non-existent keys", async () => {
			const response = await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["GET", "nonexistent:key"]),
				})
			);
			const json = await response.json();

			expect(response.status).toBe(200);
			expect(json.result).toBe(null);
		});

		it("returns error for invalid command", async () => {
			const response = await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify([]),
				})
			);
			const json = await response.json();

			expect(response.status).toBe(400);
			expect(json.error).toBeDefined();
		});
	});

	describe("Path-based Commands", () => {
		it("executes PING via path", async () => {
			const response = await app.handle(new Request("http://localhost/PING"));
			const json = await response.json();

			expect(response.status).toBe(200);
			expect(json.result).toBe("PONG");
		});

		it("executes SET and GET via path", async () => {
			// SET
			const setResponse = await app.handle(new Request("http://localhost/SET/path:key/path-value"));
			const setJson = await setResponse.json();
			expect(setJson.result).toBe("OK");

			// GET
			const getResponse = await app.handle(new Request("http://localhost/GET/path:key"));
			const getJson = await getResponse.json();
			expect(getJson.result).toBe("path-value");

			// Cleanup
			await app.handle(new Request("http://localhost/DEL/path:key"));
		});

		it("handles URL-encoded values", async () => {
			const setResponse = await app.handle(
				new Request("http://localhost/SET/url%3Akey/hello%20world")
			);
			const setJson = await setResponse.json();
			expect(setJson.result).toBe("OK");

			const getResponse = await app.handle(new Request("http://localhost/GET/url%3Akey"));
			const getJson = await getResponse.json();
			expect(getJson.result).toBe("hello world");

			// Cleanup
			await app.handle(new Request("http://localhost/DEL/url%3Akey"));
		});
	});

	describe("POST /pipeline", () => {
		it("executes multiple commands", async () => {
			const response = await app.handle(
				new Request("http://localhost/pipeline", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify([
						["SET", "pipe:k1", "v1"],
						["SET", "pipe:k2", "v2"],
						["GET", "pipe:k1"],
						["GET", "pipe:k2"],
					]),
				})
			);
			const json = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(json)).toBe(true);
			expect(json.length).toBe(4);
			expect(json[0].result).toBe("OK");
			expect(json[1].result).toBe("OK");
			expect(json[2].result).toBe("v1");
			expect(json[3].result).toBe("v2");

			// Cleanup
			await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["DEL", "pipe:k1", "pipe:k2"]),
				})
			);
		});

		it("returns error for empty pipeline", async () => {
			const response = await app.handle(
				new Request("http://localhost/pipeline", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify([]),
				})
			);
			const json = await response.json();

			expect(response.status).toBe(400);
			expect(json.error).toBeDefined();
		});
	});

	describe("POST /multi-exec", () => {
		it("executes transaction atomically", async () => {
			const response = await app.handle(
				new Request("http://localhost/multi-exec", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify([
						["SET", "tx:counter", "0"],
						["INCR", "tx:counter"],
						["INCR", "tx:counter"],
						["GET", "tx:counter"],
					]),
				})
			);
			const json = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(json)).toBe(true);
			expect(json.length).toBe(4);
			expect(json[0].result).toBe("OK");
			expect(json[1].result).toBe(1);
			expect(json[2].result).toBe(2);
			expect(json[3].result).toBe("2");

			// Cleanup
			await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["DEL", "tx:counter"]),
				})
			);
		});
	});

	describe("Hash Commands", () => {
		it("executes HSET and HGET", async () => {
			// HSET
			const hsetResponse = await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["HSET", "test:hash", "field1", "value1"]),
				})
			);
			const hsetJson = await hsetResponse.json();
			expect(hsetJson.result).toBe(1);

			// HGET
			const hgetResponse = await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["HGET", "test:hash", "field1"]),
				})
			);
			const hgetJson = await hgetResponse.json();
			expect(hgetJson.result).toBe("value1");

			// HGETALL
			const hgetallResponse = await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["HGETALL", "test:hash"]),
				})
			);
			const hgetallJson = await hgetallResponse.json();
			expect(Array.isArray(hgetallJson.result)).toBe(true);

			// Cleanup
			await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["DEL", "test:hash"]),
				})
			);
		});
	});

	describe("List Commands", () => {
		it("executes LPUSH, RPUSH, LRANGE", async () => {
			// LPUSH
			await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["LPUSH", "test:list", "a", "b", "c"]),
				})
			);

			// LRANGE
			const response = await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["LRANGE", "test:list", "0", "-1"]),
				})
			);
			const json = await response.json();
			expect(Array.isArray(json.result)).toBe(true);
			expect(json.result).toContain("a");
			expect(json.result).toContain("b");
			expect(json.result).toContain("c");

			// Cleanup
			await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["DEL", "test:list"]),
				})
			);
		});
	});

	describe("Set Commands", () => {
		it("executes SADD, SMEMBERS", async () => {
			// SADD
			const saddResponse = await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["SADD", "test:set", "a", "b", "c"]),
				})
			);
			const saddJson = await saddResponse.json();
			expect(saddJson.result).toBe(3);

			// SMEMBERS
			const smembersResponse = await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["SMEMBERS", "test:set"]),
				})
			);
			const smembersJson = await smembersResponse.json();
			expect(Array.isArray(smembersJson.result)).toBe(true);
			expect(smembersJson.result.length).toBe(3);

			// Cleanup
			await app.handle(
				new Request("http://localhost/", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(["DEL", "test:set"]),
				})
			);
		});
	});
});

