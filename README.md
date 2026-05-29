# EG Fuel Price Optimisation MVP

A multi-agent fuel price optimisation prototype for **EG Group** forecourts. Specialist LLM agents
(Demand, Competitor, Margin, Compliance) collaborate via Databricks Model Serving to propose a
recommended pump price per site. A drillable US/UK map, per-site dashboard, and live "agent room"
make the reasoning visible.

Built on the same foundation as the other Databricks Apps in this workspace
(`asos-control-tower` deployment conventions, `nexus` multi-agent patterns):
Next.js 16 (App Router) + React 19 + Tailwind v4 + Databricks Lakebase Postgres + Model Serving.

## Architecture

```
Dashboard + Agent Room (client)
        │  POST /api/pricing/recommend (SSE)
        ▼
   Orchestrator ──> Demand / Competitor / Margin / Compliance agents
        │                   │  JSON tool calls
        │                   ▼
        │            Pricing tools ──> Lakebase Postgres (seed data)
        │  agents call Databricks Model Serving
        ▼
   Final price + rationale ──> price_recommendations
```

- **`src/lib/db`** — Lakebase connection + query helpers (`pgQuery`), env config.
- **`src/lib/data/server.ts`** — cached server-side getters for sites, snapshots, map data, recommendations.
- **`src/lib/databricks.ts`** — Model Serving client (token resolution + chat completions, streaming).
- **`src/agents`** — `tools.ts` (tool defs + parse/execute), `roles.ts` (specialist presets), `orchestrator.ts` (run + synthesise).
- **`src/app/api/llm`** — proxy to a serving endpoint (`raw: true`, SSE passthrough).
- **`src/app/api/pricing/recommend`** — runs the orchestrator and streams agent turns as SSE.
- **`src/components`** — `PriceMap` (drillable choropleth), `AgentRoom` (live stream + recommendation), `Brand`.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in Databricks host / profile
npm run seed                 # create + populate the eg_app.* tables in Lakebase
npm run dev                  # http://localhost:3000
```

Two ways to reach Lakebase (see `.env.example`): a Databricks CLI profile (SDK OAuth, Mode A) or a
static `EG_LAKEBASE_URL` Postgres connection string (Mode B).

## Deploy (Databricks Apps)

This app deploys the same way as the other Databricks Apps in this workspace
(`asos-control-tower`, `adr-prototype`): a compact, committed `.next/standalone/`
bundle is the deploy source, declared as an app in `databricks.yml`.

### 1. Build + commit the bundle (git release)

```bash
npm run deploy           # build standalone bundle, commit, push current branch
npm run release -- patch # bump version, build, tag, push (patch|minor|major|X.Y.Z)
```

The scripts pack `node_modules` into `.next/standalone/node_modules.tgz` and commit only the
compact bundle (`server.js`, `.next/`, `public/`, the tarball, and a generated `app.yaml`); the
Apps runtime copies it into `$TMPDIR`, untars deps, and runs `node server.js`. `package.json` is
dropped from the bundle so the egress-proxied runtime never attempts `npm install`.

### 2. Ship it

Either point the **Databricks Apps UI** at this repo/branch (it pulls the committed
`.next/standalone/` source path), or use the DABs bundle from the CLI:

```bash
databricks bundle validate --target dev --profile alice
databricks bundle deploy   --target dev --profile alice   # uploads source + config
databricks bundle run eg-fuel-pricing --target dev --profile alice  # (re)apply config + (re)start
```

`bundle deploy` uploads the source and config; `bundle run` is what actually re-applies the app
config and restarts it. Runtime env lives in the repo-root `app.yaml` (the single source of truth);
`databricks.yml` mirrors it and declares the Lakebase `eg-fuel-pricing` database resource so the app
service principal is granted access on deploy.

## Notes

- Seed data is **synthetic** (no real EG or competitor feeds). US sites use EG America banner brands
  (Cumberland Farms, Fastrac, Kwik Shop, etc.); UK sites use the EG corporate identity.
- Tools are described as JSON blocks in the system prompt (not vendor function-calling), so any
  Databricks-served model works uniformly.
