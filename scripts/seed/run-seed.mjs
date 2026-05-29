// Run scripts/seed/seed.sql against Lakebase (or any Postgres via EG_LAKEBASE_URL).
//
// Usage:
//   node scripts/seed/run-seed.mjs
//
// Connection (mirrors src/lib/db):
//   - Mode A: Databricks SDK OAuth via DATABRICKS_PROFILE / EG_DATABRICKS_HOST
//     + EG_LAKEBASE_ENDPOINT + EG_LAKEBASE_DB.
//   - Mode B: a static Postgres URL in EG_LAKEBASE_URL.
//
// Env is read from .env.local if present.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

// Minimal .env.local loader (no dependency).
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (val.startsWith("#")) continue;
    val = val.replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv(join(repoRoot, ".env.local"));
loadEnv(join(repoRoot, ".env"));

const sql = readFileSync(join(here, "seed.sql"), "utf8");

async function getPool() {
  const pg = await import("pg");
  const { Pool } = pg.default ?? pg;

  if (process.env.EG_LAKEBASE_URL) {
    console.log("Connecting via EG_LAKEBASE_URL (Mode B)...");
    return new Pool({ connectionString: process.env.EG_LAKEBASE_URL });
  }

  console.log("Connecting via Databricks SDK OAuth (Mode A)...");
  const host = process.env.DATABRICKS_HOST || process.env.EG_DATABRICKS_HOST;
  const profile = process.env.DATABRICKS_PROFILE || "alice";
  if (!process.env.DATABRICKS_CONFIG_PROFILE) {
    process.env.DATABRICKS_CONFIG_PROFILE = profile;
  }
  if (!process.env.DATABRICKS_HOST && host) process.env.DATABRICKS_HOST = host;

  const { createLakebasePool } = await import("@databricks/lakebase");
  const { WorkspaceClient } = await import("@databricks/sdk-experimental");
  const workspaceClient = new WorkspaceClient({});
  return createLakebasePool({
    workspaceClient,
    endpoint:
      process.env.EG_LAKEBASE_ENDPOINT ||
      process.env.LAKEBASE_ENDPOINT ||
      "projects/eg-fuel-pricing/branches/production/endpoints/primary",
    database:
      process.env.PGDATABASE ||
      process.env.EG_LAKEBASE_DB ||
      "eg_fuel_pricing",
    sslMode: "require",
    max: 4,
  });
}

async function main() {
  const pool = await getPool();
  try {
    console.log("Running seed.sql...");
    await pool.query(sql);
    const counts = await pool.query(
      `SELECT
         (SELECT count(*) FROM eg_app.sites) AS sites,
         (SELECT count(*) FROM eg_app.costs) AS costs,
         (SELECT count(*) FROM eg_app.competitor_prices) AS competitor_prices,
         (SELECT count(*) FROM eg_app.demand_signals) AS demand_signals`
    );
    console.log("Seed complete:", counts.rows[0]);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
