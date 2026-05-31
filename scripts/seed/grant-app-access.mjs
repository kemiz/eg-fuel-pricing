// Grant the Databricks App service principal access to the eg_app schema.
//
// The app authenticates to Lakebase as its own service principal (a distinct
// Postgres role from the user who seeded the data), so it needs USAGE on the
// schema and SELECT/DML on its objects. Run this once after seeding / after
// first deploy.
//
// Usage:
//   APP_SP_CLIENT_ID=<uuid> node scripts/seed/grant-app-access.mjs
//   (defaults to the eg-fuel-pricing app SP if not provided)

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
    const key = m[1];
    let val = m[2];
    if (val.startsWith("#")) continue;
    val = val.replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv(join(repoRoot, ".env.local"));
loadEnv(join(repoRoot, ".env"));

const APP_SP =
  process.env.APP_SP_CLIENT_ID || "244d5db6-17e8-47db-9fbf-4d74a5ff4442";
const SCHEMA = process.env.EG_PG_APP_SCHEMA || "eg_app";

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

  const { getUsernameWithApiLookup } = await import("@databricks/lakebase");
  const { WorkspaceClient } = await import("@databricks/sdk-experimental");
  const workspaceClient = new WorkspaceClient({});
  const instance = process.env.EG_LAKEBASE_INSTANCE || "eg-fuel-pricing";
  const user =
    process.env.PGUSER || (await getUsernameWithApiLookup({ workspaceClient }));

  return new Pool({
    host:
      process.env.PGHOST ||
      "ep-nameless-tooth-d2gveqy4.database.us-east-1.cloud.databricks.com",
    port: Number(process.env.PGPORT || "5432"),
    database:
      process.env.PGDATABASE || process.env.EG_LAKEBASE_DB || "databricks_postgres",
    user,
    ssl: { rejectUnauthorized: false },
    max: 2,
    password: async () => {
      const cred = await workspaceClient.database.generateDatabaseCredential({
        request_id: `eg-grant-${Date.now()}`,
        instance_names: [instance],
      });
      return cred.token;
    },
  });
}

async function main() {
  const pool = await getPool();
  const role = APP_SP; // Databricks SP maps to a PG role named by its client id
  try {
    console.log(`Granting '${role}' access to schema ${SCHEMA}...`);

    // Ensure the SP has a Postgres role. databricks_postgres provisions roles
    // for Databricks identities; create it if it is not present yet.
    await pool.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
           EXECUTE format('CREATE ROLE %I', '${role}');
         END IF;
       END $$;`
    );

    const stmts = [
      `GRANT USAGE ON SCHEMA ${SCHEMA} TO "${role}"`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${SCHEMA} TO "${role}"`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${SCHEMA} TO "${role}"`,
      // Future objects created by the seeding role inherit the same grants.
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${SCHEMA} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${role}"`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${SCHEMA} GRANT USAGE, SELECT ON SEQUENCES TO "${role}"`,
    ];
    for (const sql of stmts) {
      console.log(`  ${sql}`);
      await pool.query(sql);
    }

    console.log("Grants applied.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
