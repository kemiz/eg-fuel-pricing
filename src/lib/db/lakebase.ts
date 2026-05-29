import "server-only";
import { createLakebasePool } from "@databricks/lakebase";
import { WorkspaceClient } from "@databricks/sdk-experimental";
import type { Pool } from "pg";
import { env } from "./env";

/**
 * Singleton Lakebase pg.Pool with automatic OAuth token rotation.
 *
 * - Deployed on Databricks Apps: the `database` resource in app.yaml injects
 *   PGHOST / endpoint config; the SDK uses the Apps service principal.
 * - Local dev (Mode A): forward the user's CLI profile via
 *   DATABRICKS_CONFIG_PROFILE so the SDK picks up the same auth as
 *   `databricks ... --profile alice`.
 * - Local dev (Mode B): set EG_LAKEBASE_URL to a static Postgres URL.
 *
 * This MVP is single-tenant (synthetic demo data), so there is no RLS / role
 * machinery — every query runs through `pgQuery` against the `eg_app` schema.
 */

let _pool: Pool | undefined;

export function lakebase(): Pool {
  if (_pool) return _pool;

  if (!process.env.DATABRICKS_CONFIG_PROFILE && env.databricksProfile) {
    process.env.DATABRICKS_CONFIG_PROFILE = env.databricksProfile;
  }
  if (!process.env.DATABRICKS_HOST && env.databricksHost) {
    process.env.DATABRICKS_HOST = env.databricksHost;
  }

  if (env.lakebaseUrl) {
    // Mode B - explicit URL with static credentials. No token rotation.
    const { Pool } = require("pg") as typeof import("pg");
    _pool = new Pool({
      connectionString: env.lakebaseUrl,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    return _pool!;
  }

  const workspaceClient = new WorkspaceClient({});

  _pool = createLakebasePool({
    workspaceClient,
    endpoint: env.lakebaseEndpoint,
    database: env.lakebaseDb,
    sslMode: "require",
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return _pool!;
}

/**
 * Run a parameterized query against the EG app schema. Use $1, $2, ... for
 * placeholders (pg style).
 */
export async function pgQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = lakebase();
  const res = await pool.query(sql, params as unknown[]);
  return res.rows as T[];
}
