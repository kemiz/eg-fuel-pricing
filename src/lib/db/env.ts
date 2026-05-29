import "server-only";

/**
 * Environment configuration for the EG fuel pricing data layer.
 *
 * Two modes:
 *   - **Databricks Apps (deployed)**: app.yaml sets PGDATABASE,
 *     LAKEBASE_ENDPOINT and EG_* vars explicitly.
 *   - **Local dev**: mint OAuth tokens via the Databricks SDK using the
 *     workspace profile referenced by DATABRICKS_PROFILE / EG_DATABRICKS_HOST,
 *     or point EG_LAKEBASE_URL at any Postgres for a fully local loop.
 */
function normalizeDatabricksHost(value: string | undefined): string | undefined {
  const host = value?.trim().replace(/\/$/, "");
  if (!host) return undefined;
  return /^https?:\/\//i.test(host) ? host : `https://${host}`;
}

export const env = {
  databricksHost:
    normalizeDatabricksHost(process.env.DATABRICKS_HOST) ??
    normalizeDatabricksHost(process.env.EG_DATABRICKS_HOST) ??
    "",
  databricksProfile: process.env.DATABRICKS_PROFILE ?? "alice",

  // Lakebase (direct database instance)
  lakebaseInstance:
    process.env.EG_LAKEBASE_INSTANCE ?? "eg-fuel-pricing",
  lakebaseHost:
    process.env.PGHOST ??
    process.env.EG_LAKEBASE_HOST ??
    "ep-nameless-tooth-d2gveqy4.database.us-east-1.cloud.databricks.com",
  lakebasePort: Number(process.env.PGPORT ?? "5432"),
  lakebaseDb:
    process.env.PGDATABASE ??
    process.env.EG_LAKEBASE_DB ??
    "databricks_postgres",
  lakebaseUser: process.env.PGUSER ?? process.env.EG_LAKEBASE_USER,
  // Mode B: a fully-specified static Postgres URL (skips OAuth credential mint).
  lakebaseUrl: process.env.EG_LAKEBASE_URL,

  // Schema layout
  pgAppSchema: process.env.EG_PG_APP_SCHEMA ?? "eg_app",

  // Model Serving
  llmEndpoint:
    process.env.EG_LLM_ENDPOINT ??
    "serving-endpoints/databricks-claude-sonnet-4-6/invocations",
  llmFastEndpoint:
    process.env.EG_LLM_FAST_ENDPOINT ??
    "serving-endpoints/databricks-claude-haiku-4-5/invocations",
};

export const APP = (table: string) => `${env.pgAppSchema}.${table}`;
