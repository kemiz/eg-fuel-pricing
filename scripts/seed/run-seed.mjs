// Seed the EG Lakebase instance: apply schema.sql, then generate + insert
// synthetic site / cost / competitor / demand data from sites.mjs.
//
// Usage:
//   node scripts/seed/run-seed.mjs
//
// Connection (mirrors src/lib/db):
//   - Mode A: Databricks SDK credential for the `eg-fuel-pricing` instance via
//     DATABRICKS_PROFILE / EG_DATABRICKS_HOST + PGHOST + PGDATABASE.
//   - Mode B: a static Postgres URL in EG_LAKEBASE_URL.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSites } from "./sites.mjs";

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

const schema = readFileSync(join(here, "schema.sql"), "utf8");

// Deterministic PRNG so reseeds are stable.
let _s = 987654321;
function rand() {
  _s = (_s * 1103515245 + 12345) & 0x7fffffff;
  return _s / 0x7fffffff;
}
function between(a, b) {
  return a + (b - a) * rand();
}
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

const GRADES = [
  ["regular", "Regular Unleaded", 1],
  ["premium", "Premium Unleaded", 2],
  ["diesel", "Diesel", 3],
];

const US_COMPETITORS = ["Shell", "BP", "Sunoco", "Speedway", "Exxon", "Wawa"];
const UK_COMPETITORS = ["Tesco", "BP", "Shell", "Asda", "Sainsbury's", "Esso"];

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
    database: process.env.PGDATABASE || process.env.EG_LAKEBASE_DB || "databricks_postgres",
    user,
    ssl: { rejectUnauthorized: false },
    max: 4,
    password: async () => {
      const cred = await workspaceClient.database.generateDatabaseCredential({
        request_id: `eg-seed-${Date.now()}`,
        instance_names: [instance],
      });
      return cred.token;
    },
  });
}

function gradeBump(grade, premium, diesel) {
  return grade === "premium" ? premium : grade === "diesel" ? diesel : 0;
}

async function main() {
  const sites = buildSites();
  const pool = await getPool();
  try {
    console.log(`Applying schema and seeding ${sites.length} sites...`);
    await pool.query(schema);

    await pool.query(
      `INSERT INTO eg_app.fuel_grades (grade_id, label, sort_order) VALUES ($1,$2,$3),($4,$5,$6),($7,$8,$9)`,
      GRADES.flat()
    );

    for (const s of sites) {
      const isUS = s.country === "US";
      const currency = isUS ? "USD" : "GBP";
      const unit = isUS ? "gal" : "litre";
      await pool.query(
        `INSERT INTO eg_app.sites (site_id,name,brand,country,region,currency,unit,lat,lon)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [s.id, s.name, s.brand, s.country, s.region, currency, unit, s.lat, s.lon]
      );

      // Base wholesale cost varies a little per site to make regions distinct.
      const baseCost = isUS ? between(2.85, 3.15) : between(1.28, 1.42);
      const delivery = isUS ? 0.12 : 0.04;
      const compMargin = isUS ? between(0.38, 0.55) : between(0.14, 0.22);

      for (const [grade] of GRADES) {
        const wholesale = Number(
          (baseCost + gradeBump(grade, isUS ? 0.3 : 0.08, isUS ? 0.1 : 0.05)).toFixed(3)
        );
        await pool.query(
          `INSERT INTO eg_app.costs (site_id,grade_id,wholesale_cost,delivery_cost) VALUES ($1,$2,$3,$4)`,
          [s.id, grade, wholesale, delivery]
        );

        // 2-3 competitors per site/grade.
        const pool_ = isUS ? US_COMPETITORS : UK_COMPETITORS;
        const nComp = 2 + Math.floor(rand() * 2);
        const chosen = new Set();
        // Capture each competitor's current price to anchor the history series.
        const competitorNow = [];
        for (let i = 0; i < nComp; i++) {
          let name = pick(pool_);
          let guard = 0;
          while (chosen.has(name) && guard++ < 5) name = pick(pool_);
          chosen.add(name);
          const price = Number(
            (wholesale + delivery + compMargin + between(isUS ? -0.08 : -0.04, isUS ? 0.08 : 0.04)).toFixed(3)
          );
          competitorNow.push({ name, price });
          await pool.query(
            `INSERT INTO eg_app.competitor_prices (site_id,competitor_name,grade_id,price,lat,lon)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              s.id,
              name,
              grade,
              price,
              Number((s.lat + between(-0.015, 0.015)).toFixed(4)),
              Number((s.lon + between(-0.015, 0.015)).toFixed(4)),
            ]
          );
        }

        // Demand.
        const baseVol = grade === "regular" ? 2200 : grade === "diesel" ? 1400 : 700;
        const elasticity = Number((-1.1 - rand() * 1.0).toFixed(2));
        const trend = pick(["up", "flat", "down"]);
        const volume = Math.round(baseVol + between(-300, 700));
        await pool.query(
          `INSERT INTO eg_app.demand_signals (site_id,grade_id,avg_daily_volume,elasticity,trend)
           VALUES ($1,$2,$3,$4,$5)`,
          [s.id, grade, volume, elasticity, trend]
        );

        // Baseline recommendation per grade so the network has real margin
        // variation before any agent run. Each site picks a position vs the
        // competitor set (undercut / match / small premium) so margins differ.
        const unitCost = wholesale + delivery;
        const positioning = between(-0.6, 0.5); // < 0 undercut, > 0 premium
        const targetMargin = Math.max(
          isUS ? 0.18 : 0.08,
          compMargin + positioning * (isUS ? 0.12 : 0.05)
        );
        const recPrice = Number((unitCost + targetMargin).toFixed(3));
        const projVol = Math.round(volume * (1 + positioning * 0.04));
        const projMargin = Number((targetMargin * projVol).toFixed(2));
        const confidence = Number((0.6 + rand() * 0.3).toFixed(2));
        await pool.query(
          `INSERT INTO eg_app.price_recommendations
             (site_id, grade_id, recommended_price, rationale,
              projected_margin, projected_volume, confidence, per_agent_notes, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb, now() - ($9 || ' days')::interval)`,
          [
            s.id,
            grade,
            recPrice,
            positioning < -0.15
              ? "Baseline: priced below the local competitor set to defend volume."
              : positioning > 0.15
                ? "Baseline: small premium held given a stable competitive set."
                : "Baseline: matched to the local competitor average.",
            projMargin,
            projVol,
            confidence,
            JSON.stringify([]),
            Math.floor(rand() * 14),
          ]
        );

        // -----------------------------------------------------------------
        // Historical daily price series (~90 days) for EG + each competitor.
        // A shared market wave drives all series; each series ends at its
        // current value so the chart lines up with today's prices.
        // -----------------------------------------------------------------
        const DAYS = 90;
        const dp = isUS ? 2 : 3;
        const round = (v) => Number(v.toFixed(dp));
        // Market wave: smooth seasonal swing + slow drift over the window.
        const amp = isUS ? between(0.1, 0.22) : between(0.04, 0.09);
        const drift = between(-0.12, 0.12) * (isUS ? 1 : 0.4);
        const phase = rand() * Math.PI * 2;
        const period = between(28, 55);
        // wave(t): t=0 is today (offset 0), t=DAYS is the oldest day.
        const wave = (t) =>
          amp * Math.sin(phase + (t / period) * Math.PI * 2) -
          drift * (t / DAYS); // subtract so today reflects full drift

        const egCurrent = recPrice;
        const compAvgNow =
          competitorNow.reduce((a, c) => a + c.price, 0) / competitorNow.length;

        const histValues = [];
        for (let t = 0; t <= DAYS; t++) {
          const day = `now() - (${t} || ' days')::interval`;
          const w = wave(t);
          // EG series.
          const egNoise = between(-0.01, 0.01) * (isUS ? 1 : 0.4);
          histValues.push({
            series: "EG",
            isEg: true,
            t,
            price: round(Math.max(wholesale + delivery + 0.02, egCurrent + w + egNoise)),
          });
          // Competitor series (each tracks the wave with its own offset/noise).
          for (const c of competitorNow) {
            const cNoise = between(-0.015, 0.015) * (isUS ? 1 : 0.4);
            histValues.push({
              series: c.name,
              isEg: false,
              t,
              price: round(Math.max(0.1, c.price + w + cNoise)),
            });
          }
        }
        // Bulk insert this site/grade's history.
        const vals = [];
        const params = [];
        let p = 1;
        for (const h of histValues) {
          vals.push(
            `($${p++}, $${p++}, $${p++}, $${p++}, now()::date - $${p++}::int, $${p++})`
          );
          params.push(s.id, grade, h.series, h.isEg, h.t, h.price);
        }
        await pool.query(
          `INSERT INTO eg_app.price_history (site_id, grade_id, series, is_eg, day, price)
           VALUES ${vals.join(",")}`,
          params
        );
        void compAvgNow;
      }
    }

    const counts = await pool.query(
      `SELECT
         (SELECT count(*) FROM eg_app.sites) AS sites,
         (SELECT count(*) FROM eg_app.sites WHERE country='US') AS us,
         (SELECT count(*) FROM eg_app.sites WHERE country='UK') AS uk,
         (SELECT count(*) FROM eg_app.costs) AS costs,
         (SELECT count(*) FROM eg_app.competitor_prices) AS competitor_prices,
         (SELECT count(*) FROM eg_app.demand_signals) AS demand_signals,
         (SELECT count(*) FROM eg_app.price_history) AS price_history`
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
