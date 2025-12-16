import Redis, { Cluster } from "ioredis";
import { config } from "../config";

type RedisClient = Redis | Cluster;

/**
 * Redis client manager with support for:
 * - Single instance (default)
 * - Connection pooling (for high-throughput scenarios)
 * - Cluster mode (for Redis Cluster deployments)
 */
class RedisClientManager {
	private client: RedisClient | null = null;
	private connectionPromise: Promise<RedisClient> | null = null;
	private pool: Redis[] = [];
	private poolIndex = 0;

	async getClient(): Promise<RedisClient> {
		// Cluster mode
		if (config.cluster.enabled) {
			return this.getClusterClient();
		}

		// Pool mode - round-robin across connections
		if (config.pool.enabled) {
			return this.getPooledClient();
		}

		// Single client mode (default)
		return this.getSingleClient();
	}

	private async getSingleClient(): Promise<Redis> {
		// Fast path: return ready client
		if (this.client?.status === "ready" && !(this.client instanceof Cluster)) {
			return this.client as Redis;
		}

		// If already connecting, wait for that connection
		if (this.connectionPromise) {
			return this.connectionPromise as Promise<Redis>;
		}

		// Start new connection (atomic assignment prevents race)
		this.connectionPromise = this.createSingleClient();

		try {
			this.client = await this.connectionPromise;
			return this.client as Redis;
		} catch (error) {
			// Reset on failure so next call can retry
			this.connectionPromise = null;
			throw error;
		}
	}

	private async getPooledClient(): Promise<Redis> {
		// Initialize pool if needed
		if (this.pool.length === 0) {
			await this.initializePool();
		}

		// Round-robin selection
		const client = this.pool[this.poolIndex];
		this.poolIndex = (this.poolIndex + 1) % this.pool.length;

		// Check if client is ready, reconnect if needed
		if (client.status !== "ready") {
			await client.connect();
		}

		return client;
	}

	private async getClusterClient(): Promise<Cluster> {
		if (this.client instanceof Cluster && this.client.status === "ready") {
			return this.client;
		}

		if (this.connectionPromise) {
			return this.connectionPromise as Promise<Cluster>;
		}

		this.connectionPromise = this.createClusterClient();

		try {
			this.client = await this.connectionPromise;
			return this.client as Cluster;
		} catch (error) {
			this.connectionPromise = null;
			throw error;
		}
	}

	private async createSingleClient(): Promise<Redis> {
		const client = new Redis(config.redisUrl, {
			connectTimeout: config.connectionTimeout,
			commandTimeout: config.commandTimeout,
			retryStrategy: (times) => {
				if (times > 3) {
					return null; // Stop retrying
				}
				return Math.min(times * 200, 2000);
			},
			lazyConnect: true,
		});

		this.setupEventHandlers(client, "Redis");

		await client.connect();
		return client;
	}

	private async initializePool(): Promise<void> {
		const poolSize = Math.max(config.pool.min, 1);

		if (config.verbose) {
			console.log(`[Redis Pool] Initializing ${poolSize} connections...`);
		}

		const connections = await Promise.all(
			Array.from({ length: poolSize }, (_, i) => this.createPooledConnection(i))
		);

		this.pool = connections;

		if (config.verbose) {
			console.log(`[Redis Pool] ${this.pool.length} connections ready`);
		}
	}

	private async createPooledConnection(index: number): Promise<Redis> {
		const client = new Redis(config.redisUrl, {
			connectTimeout: config.connectionTimeout,
			commandTimeout: config.commandTimeout,
			retryStrategy: (times) => {
				if (times > 3) {
					return null;
				}
				return Math.min(times * 200, 2000);
			},
			lazyConnect: true,
		});

		this.setupEventHandlers(client, `Pool[${index}]`);

		await client.connect();
		return client;
	}

	private async createClusterClient(): Promise<Cluster> {
		if (config.cluster.nodes.length === 0) {
			throw new Error("Redis Cluster enabled but no nodes configured. Set REDIS_CLUSTER_NODES.");
		}

		// Parse cluster nodes from URLs
		const nodes = config.cluster.nodes.map((nodeUrl) => {
			try {
				const url = new URL(nodeUrl);
				return {
					host: url.hostname,
					port: Number.parseInt(url.port, 10) || 6379,
				};
			} catch {
				// Fallback: parse as host:port
				const [host, port] = nodeUrl.split(":");
				return {
					host: host || "localhost",
					port: Number.parseInt(port, 10) || 6379,
				};
			}
		});

		const cluster = new Cluster(nodes, {
			scaleReads: config.cluster.scaleReads,
			redisOptions: {
				connectTimeout: config.connectionTimeout,
				commandTimeout: config.commandTimeout,
				password: this.extractPassword(config.redisUrl),
			},
			clusterRetryStrategy: (times) => {
				if (times > 3) {
					return null;
				}
				return Math.min(times * 200, 2000);
			},
			lazyConnect: true,
		});

		this.setupEventHandlers(cluster, "Cluster");

		await cluster.connect();

		if (config.verbose) {
			console.log(`[Redis Cluster] Connected to ${nodes.length} nodes`);
		}

		return cluster;
	}

	private extractPassword(redisUrl: string): string | undefined {
		try {
			const url = new URL(redisUrl);
			return url.password || undefined;
		} catch {
			return undefined;
		}
	}

	private setupEventHandlers(client: RedisClient, label: string): void {
		client.on("error", (err) => {
			if (config.verbose) {
				console.error(`[${label}] Connection error:`, err.message);
			}
		});

		client.on("connect", () => {
			if (config.verbose) {
				console.log(`[${label}] Connected`);
			}
		});

		client.on("close", () => {
			if (config.verbose) {
				console.log(`[${label}] Connection closed`);
			}
		});

		if (client instanceof Cluster) {
			client.on("node error", (err, address) => {
				if (config.verbose) {
					console.error(`[${label}] Node ${address} error:`, err.message);
				}
			});
		}
	}

	async disconnect(): Promise<void> {
		// Disconnect pool connections
		if (this.pool.length > 0) {
			await Promise.all(this.pool.map((c) => c.quit()));
			this.pool = [];
		}

		// Disconnect single/cluster client
		if (this.client) {
			await this.client.quit();
			this.client = null;
			this.connectionPromise = null;
		}
	}

	/**
	 * Execute a Redis command dynamically
	 */
	async execute(command: string, args: (string | number | Buffer)[]): Promise<unknown> {
		const client = await this.getClient();
		const cmd = command.toUpperCase();
		return client.call(cmd, ...args);
	}

	/**
	 * Execute multiple commands in a pipeline
	 */
	async pipeline(
		commands: Array<[string, ...(string | number | Buffer)[]]>
	): Promise<Array<[Error | null, unknown]>> {
		const client = await this.getClient();
		const pipeline = client.pipeline();

		for (const [cmd, ...args] of commands) {
			pipeline.call(cmd.toUpperCase(), ...args);
		}

		const results = await pipeline.exec();
		return results ?? [];
	}

	/**
	 * Execute multiple commands in a transaction (MULTI/EXEC)
	 */
	async transaction(
		commands: Array<[string, ...(string | number | Buffer)[]]>
	): Promise<Array<unknown>> {
		const client = await this.getClient();
		const multi = client.multi();

		for (const [cmd, ...args] of commands) {
			multi.call(cmd.toUpperCase(), ...args);
		}

		const results = await multi.exec();
		if (!results) {
			throw new Error("Transaction was aborted");
		}

		// Check for errors in transaction results
		const errors = results.filter(([err]) => err !== null);
		if (errors.length > 0) {
			throw new Error(`Transaction failed: ${errors[0][0]?.message}`);
		}

		return results.map(([, value]) => value);
	}

	/**
	 * Get pool statistics (for monitoring)
	 */
	getPoolStats(): { mode: string; connections: number; activeIndex: number } {
		if (config.cluster.enabled) {
			return { mode: "cluster", connections: config.cluster.nodes.length, activeIndex: 0 };
		}
		if (config.pool.enabled) {
			return { mode: "pool", connections: this.pool.length, activeIndex: this.poolIndex };
		}
		return { mode: "single", connections: this.client ? 1 : 0, activeIndex: 0 };
	}
}

export const redisClient = new RedisClientManager();
