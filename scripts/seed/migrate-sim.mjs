// Apply the simulation-mode tables (sim_state, sim_events) on top of the
// existing seeded baseline, then re-grant the app service principal so the
// deployed app can read/write them.
//
// Usage:
//   DATABRICKS_PROFILE=alice EG_DATABRICKS_HOST=https://… node scripts/seed/migrate-sim.mjs

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith("#")) continue;
    val = val.replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadEnv(join(repoRoot, ".env.local"));
loadEnv(join(repoRoot, ".env"));

const SCHEMA = process.env.EG_PG_APP_SCHEMA || "eg_app";
const APP_SP =
  process.env.APP_SP_CLIENT_ID || "244d5db6-17e8-47db-9fbf-4d74a5ff4442";

async function getPool() {
  const pg = await import("pg");
  const { Pool } = pg.default ?? pg;
  if (process.env.EG_LAKEBASE_URL) {
    return new Pool({ connectionString: process.env.EG_LAKEBASE_URL });
  }
  const profile = process.env.DATABRICKS_PROFILE || "alice";
  if (!process.env.DATABRICKS_CONFIG_PROFILE)
    process.env.DATABRICKS_CONFIG_PROFILE = profile;
  if (!process.env.DATABRICKS_HOST && process.env.EG_DATABRICKS_HOST)
    process.env.DATABRICKS_HOST = process.env.EG_DATABRICKS_HOST;

  const { getUsernameWithApiLookup } = await import("@databricks/lakebase");
  const { WorkspaceClient } = await import("@databricks/sdk-experimental");
  const wc = new WorkspaceClient({});
  const instance = process.env.EG_LAKEBASE_INSTANCE || "eg-fuel-pricing";
  const user =
    process.env.PGUSER || (await getUsernameWithApiLookup({ workspaceClient: wc }));
  return new Pool({
    host:
      process.env.PGHOST ||
      "ep-nameless-tooth-d2gveqy4.database.us-east-1.cloud.databricks.com",
    port: Number(process.env.PGPORT || "5432"),
    database: process.env.PGDATABASE || "databricks_postgres",
    user,
    ssl: { rejectUnauthorized: false },
    max: 2,
    password: async () =>
      (
        await wc.database.generateDatabaseCredential({
          request_id: `eg-migrate-${Date.now()}`,
          instance_names: [instance],
        })
      ).token,
  });
}

async function main() {
  const pool = await getPool();
  try {
    console.log("Applying sim-schema.sql...");
    const ddl = readFileSync(join(here, "sim-schema.sql"), "utf8");
    await pool.query(ddl);

    // Re-anchor the clock to the seeded baseline and clear run-scoped state.
    // The seed writes day 0 = now()::date (today) and ~90 days of PAST history,
    // so the true baseline is today's date — NOT max(day). If a previous sim run
    // stepped forward it appended FUTURE days to price_history; anchoring to
    // max(day) would then lock the baseline onto those simulated future days
    // (e.g. months ahead). So we first drop anything past today, then anchor to
    // today (max(day) only as a fallback when there is no history at all).
    console.log("Dropping any sim-appended future days + re-anchoring to today...");
    const delFuture = await pool.query(
      `DELETE FROM ${SCHEMA}.price_history WHERE day > now()::date`
    );
    if (delFuture.rowCount)
      console.log(`  removed ${delFuture.rowCount} future price_history rows`);
    await pool.query(`TRUNCATE ${SCHEMA}.sim_events`);
    // The performance tape + intervention log are tied to a simulation run, so
    // clear them when the clock is re-anchored to the seeded baseline.
    await pool.query(`TRUNCATE ${SCHEMA}.sim_daily_perf`);
    await pool.query(`TRUNCATE ${SCHEMA}.sim_interventions`);
    // Drop recommendations generated during a discarded run (keep seeded baseline).
    await pool.query(
      `DELETE FROM ${SCHEMA}.price_recommendations
        WHERE sim_day_index IS NOT NULL AND sim_day_index > 0`
    );
    await pool.query(
      `UPDATE ${SCHEMA}.sim_state
          SET sim_date = LEAST(
                now()::date,
                COALESCE((SELECT max(day) FROM ${SCHEMA}.price_history), now()::date)
              ),
              day_index = 0,
              running = false,
              updated_at = now()
        WHERE id = 1`
    );
    // Reset the carried walk levels so the sim restarts from the seeded baseline.
    await pool.query(
      `UPDATE ${SCHEMA}.sim_signal_state
          SET day_index = 0, levels = '{}'::jsonb, updated_at = now()
        WHERE id = 1`
    );

    console.log(`Re-granting '${APP_SP}' on schema ${SCHEMA}...`);
    const stmts = [
      `GRANT USAGE ON SCHEMA ${SCHEMA} TO "${APP_SP}"`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${SCHEMA} TO "${APP_SP}"`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${SCHEMA} TO "${APP_SP}"`,
    ];
    for (const sql of stmts) await pool.query(sql);

    const { rows } = await pool.query(
      `SELECT sim_date, day_index, running, speed_ms FROM ${SCHEMA}.sim_state WHERE id = 1`
    );
    console.log("sim_state:", rows[0]);
    console.log("Migration complete.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
