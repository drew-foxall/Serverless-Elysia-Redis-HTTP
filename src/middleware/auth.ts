import { Elysia } from "elysia";
import { config } from "../config";
import { secureCompare } from "../utils/security";

/**
 * Authentication middleware that supports Upstash-compatible authentication
 *
 * Supports:
 * - Bearer token: Authorization: Bearer <token>
 * - Basic auth: Authorization: Basic <base64(username:token)>
 * - No auth (when TOKEN is not configured)
 */
export const authMiddleware = new Elysia({ name: "auth" }).derive(
	{ as: "global" },
	({ request, set }) => {
		// If no token is configured, allow all requests
		if (!config.token) {
			return { authenticated: true };
		}

		const authHeader = request.headers.get("authorization");

		if (!authHeader) {
			set.status = 401;
			return {
				authenticated: false,
				error: "Unauthorized - Missing Authorization header",
			};
		}

		// Handle Bearer token
		if (authHeader.toLowerCase().startsWith("bearer ")) {
			const token = authHeader.slice(7).trim();

			// Use timing-safe comparison to prevent timing attacks
			if (secureCompare(token, config.token)) {
				return { authenticated: true };
			}

			set.status = 401;
			return {
				authenticated: false,
				error: "Unauthorized - Invalid token",
			};
		}

		// Handle Basic auth (Upstash uses base64(default:token))
		if (authHeader.toLowerCase().startsWith("basic ")) {
			try {
				const base64 = authHeader.slice(6).trim();
				const decoded = Buffer.from(base64, "base64").toString("utf-8");
				const colonIndex = decoded.indexOf(":");

				if (colonIndex === -1) {
					throw new Error("Invalid basic auth format");
				}

				const password = decoded.slice(colonIndex + 1);

				// Use timing-safe comparison to prevent timing attacks
				if (secureCompare(password, config.token)) {
					return { authenticated: true };
				}
			} catch {
				// Invalid base64 or format, fall through to unauthorized
			}

			set.status = 401;
			return {
				authenticated: false,
				error: "Unauthorized - Invalid credentials",
			};
		}

		set.status = 401;
		return {
			authenticated: false,
			error: "Unauthorized - Unsupported authentication method",
		};
	}
);

/**
 * Guard that checks authentication status and returns early if not authenticated
 */
export const requireAuth = new Elysia({ name: "require-auth" })
	.use(authMiddleware)
	.onBeforeHandle(({ authenticated, error, set }) => {
		if (!authenticated) {
			set.status = 401;
			return { error: error ?? "Unauthorized" };
		}
	});
