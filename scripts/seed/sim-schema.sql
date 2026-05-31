-- ===========================================================================
-- EG Fuel Price Optimisation — simulation mode tables (additive migration)
-- ===========================================================================
-- Adds a simulation clock + an event log on top of the seeded baseline. Safe to
-- run repeatedly: tables are created IF NOT EXISTS and sim_state is seeded with
-- a single row anchored to the latest price_history day.
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS eg_app;

-- Stamp recommendations with the simulated day they were generated on, so the
-- UI can display their age on the moving sim clock instead of real wall-clock
-- time ("3 days ago" should mean 3 SIM days). Additive + safe on existing DBs.
ALTER TABLE eg_app.price_recommendations
  ADD COLUMN IF NOT EXISTS sim_day_index INT;

-- Preserve the seeded baseline volume so a reset can restore volumes to their
-- day-0 level (avg_daily_volume is mutated each simulated day). Additive + safe
-- to run on existing DBs; backfilled from the current value only where unset so
-- a fresh re-seed keeps its true baseline.
ALTER TABLE eg_app.demand_signals
  ADD COLUMN IF NOT EXISTS base_avg_daily_volume INT;
UPDATE eg_app.demand_signals
  SET base_avg_daily_volume = avg_daily_volume
  WHERE base_avg_daily_volume IS NULL;

-- Single-row clock. id is fixed to 1 so we always upsert the same row.
CREATE TABLE IF NOT EXISTS eg_app.sim_state (
  id          INT PRIMARY KEY DEFAULT 1,
  sim_date    DATE NOT NULL,
  day_index   INT NOT NULL DEFAULT 0,   -- days advanced past the seeded baseline
  running     BOOLEAN NOT NULL DEFAULT false,
  speed_ms    INT NOT NULL DEFAULT 3000, -- auto-advance interval the client uses
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sim_state_singleton CHECK (id = 1)
);

-- Day-stamped market events (shocks the engine emits) so the UI can surface
-- "what happened" as the clock advances.
CREATE TABLE IF NOT EXISTS eg_app.sim_events (
  id        BIGSERIAL PRIMARY KEY,
  day       DATE NOT NULL,
  day_index INT NOT NULL,
  scope     TEXT NOT NULL,            -- 'network' | 'region' | 'site'
  ref       TEXT,                     -- region name or site_id when scoped
  kind      TEXT NOT NULL,            -- 'crude_spike' | 'price_war' | 'outage' | 'demand_swing'
  headline  TEXT NOT NULL,
  detail    TEXT,
  tone      TEXT NOT NULL DEFAULT 'neutral', -- good | bad | neutral
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sim_events_day ON eg_app.sim_events(day_index DESC, id DESC);

-- Carried signal state for the mean-reverting random walks (the SAME process as
-- the seed's makeSignal, advanced one day at a time). A single JSONB blob holds,
-- per series key, the current walk level(s) + the previous "drive" so the engine
-- can continue the exact recurrence statelessly between requests. day_index marks
-- which simulated day the levels are valid for.
CREATE TABLE IF NOT EXISTS eg_app.sim_signal_state (
  id         INT PRIMARY KEY DEFAULT 1,
  day_index  INT NOT NULL DEFAULT 0,
  levels     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sim_signal_state_singleton CHECK (id = 1)
);

INSERT INTO eg_app.sim_signal_state (id, day_index, levels)
VALUES (1, 0, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Performance ledger: one row per simulated day, captured AT STEP TIME from the
-- engine's actual per-day numbers (so margin pool uses that day's real volume,
-- not today's). This is the "experiment tape": how the network actually
-- performed each day, plus a COUNTERFACTUAL — what the same day would have
-- earned had EG held its baseline-day prices flat. The gap is the uplift
-- attributable to active pricing (recommendations + manual changes + the sim's
-- own moves). country = 'US' | 'UK' | 'ALL' (the network roll-up).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eg_app.sim_daily_perf (
  day_index     INT NOT NULL,
  day           DATE NOT NULL,
  country       TEXT NOT NULL,             -- 'US' | 'UK' | 'ALL'
  sites         INT NOT NULL,
  volume        NUMERIC NOT NULL,          -- total daily volume (regular)
  revenue       NUMERIC NOT NULL,          -- sum(eg_price * volume)
  margin_pool   NUMERIC NOT NULL,          -- sum((eg_price - unit_cost) * volume)
  avg_margin    NUMERIC NOT NULL,          -- volume-weighted per-unit margin
  avg_eg_price  NUMERIC NOT NULL,
  avg_comp_price NUMERIC,                  -- volume-weighted competitor avg
  cheaper       INT NOT NULL DEFAULT 0,    -- positioning counts vs local rivals
  in_line       INT NOT NULL DEFAULT 0,
  dearer        INT NOT NULL DEFAULT 0,
  -- Counterfactual: hold EG's BASELINE-day price flat, same day's cost+demand.
  cf_volume     NUMERIC NOT NULL DEFAULT 0,
  cf_margin_pool NUMERIC NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day_index, country)
);

CREATE INDEX IF NOT EXISTS idx_sim_daily_perf_day ON eg_app.sim_daily_perf(day_index, country);

-- ---------------------------------------------------------------------------
-- Intervention log: every operator/agent price change that was APPLIED to the
-- forecourt, with the projection at apply time and the price it replaced. The
-- realized before/after impact is computed at read time from sim_daily_perf +
-- price_history, so we can show whether each change actually helped.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eg_app.sim_interventions (
  id            BIGSERIAL PRIMARY KEY,
  day_index     INT NOT NULL,              -- simulated day the change landed on
  day           DATE NOT NULL,
  site_id       TEXT NOT NULL,
  grade_id      TEXT NOT NULL DEFAULT 'regular',
  source        TEXT NOT NULL,             -- 'manual' | 'recommendation' | 'agent'
  old_price     NUMERIC,                   -- EG price before the change
  new_price     NUMERIC NOT NULL,
  unit_cost     NUMERIC,
  projected_margin NUMERIC,                -- daily margin the agent projected
  projected_volume NUMERIC,
  confidence    NUMERIC,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sim_interventions_day ON eg_app.sim_interventions(day_index DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_sim_interventions_site ON eg_app.sim_interventions(site_id, day_index);

-- Seed the clock from the newest price_history day (the seeded "today"). Only
-- inserts if the clock does not exist yet, so re-running never rewinds it.
INSERT INTO eg_app.sim_state (id, sim_date, day_index, running, speed_ms)
SELECT 1,
       COALESCE((SELECT max(day) FROM eg_app.price_history), CURRENT_DATE),
       0, false, 3000
ON CONFLICT (id) DO NOTHING;
