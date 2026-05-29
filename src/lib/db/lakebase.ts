import "server-only";
import { WorkspaceClient } from "@databricks/sdk-experimental";
import { getUsernameWithApiLookup } from "@databricks/lakebase";
import type { Pool } from "pg";
import { env } from "./env";

/**
 * Singleton Lakebase pg.Pool for the `eg-fuel-pricing` database instance.
 *
 * Auth strategy (direct database instance, PG-native login enabled):
 *   - Standard pg.Pool to PGHOST / PGDATABASE over TLS.
 *   - The Postgres `password` is a short-lived OAuth credential minted via the
 *     Databricks SDK (`database.generateDatabaseCredential`) for the instance.
 *     pg invokes the callback on each new connection, so 1h tokens rotate
 *     automatically; we cache within the TTL.
 *   - Username resolves from PGUSER / DATABRICKS_CLIENT_ID / the workspace API.
 *
 * Local dev forwards DATABRICKS_CONFIG_PROFILE so the SDK uses the same auth as
 * `databricks ... --profile alice`. Mode B (EG_LAKEBASE_URL) bypasses all this.
 */

let _pool: Pool | undefined;
let _workspaceClient: WorkspaceClient | undefined;
let _cachedCred: { token: string; expiresAt: number } | undefined;
let _usernamePromise: Promise<string | undefined> | undefined;

function ensureProfileEnv() {
  if (!process.env.DATABRICKS_CONFIG_PROFILE && env.databricksProfile) {
    process.env.DATABRICKS_CONFIG_PROFILE = env.databricksProfile;
  }
  if (!process.env.DATABRICKS_HOST && env.databricksHost) {
    process.env.DATABRICKS_HOST = env.databricksHost;
  }
}

function workspace(): WorkspaceClient {
  if (!_workspaceClient) {
    ensureProfileEnv();
    _workspaceClient = new WorkspaceClient({});
  }
  return _workspaceClient;
}

async function mintPassword(): Promise<string> {
  const now = Date.now();
  if (_cachedCred && _cachedCred.expiresAt > now + 60_000) {
    return _cachedCred.token;
  }
  const cred = await workspace().database.generateDatabaseCredential({
    request_id: `eg-${now}`,
    instance_names: [env.lakebaseInstance],
  });
  const token = cred.token;
  if (!token) throw new Error("Failed to mint Lakebase database credential");
  const expiresAt = cred.expiration_time
    ? Date.parse(cred.expiration_time)
    : now + 55 * 60_000;
  _cachedCred = { token, expiresAt };
  return token;
}

async function resolveUsername(): Promise<string | undefined> {
  if (env.lakebaseUser) return env.lakebaseUser;
  if (!_usernamePromise) {
    _usernamePromise = getUsernameWithApiLookup({ workspaceClient: workspace() });
  }
  return _usernamePromise;
}

function createPool(user?: string): Pool {
  const { Pool } = require("pg") as typeof import("pg");
  if (env.lakebaseUrl) {
    // Mode B - explicit URL with static credentials. No token rotation.
    return new Pool({
      connectionString: env.lakebaseUrl,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return new Pool({
    host: env.lakebaseHost,
    port: env.lakebasePort,
    database: env.lakebaseDb,
    user,
    ssl: { rejectUnauthorized: false },
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    password: async () => mintPassword(),
  });
}

async function getPool(): Promise<Pool> {
  if (_pool) return _pool;
  const user = env.lakebaseUrl ? undefined : await resolveUsername();
  _pool = createPool(user);
  return _pool;
}

/**
 * Run a parameterized query against the EG app schema. Use $1, $2, ... for
 * placeholders (pg style).
 */
export async function pgQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = await getPool();
  const res = await pool.query(sql, params as unknown[]);
  return res.rows as T[];
}
