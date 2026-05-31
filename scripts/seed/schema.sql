-- ===========================================================================
-- EG Fuel Price Optimisation MVP — schema (DDL only)
-- ===========================================================================
-- Data is generated and inserted by scripts/seed/run-seed.mjs from
-- scripts/seed/sites.mjs. This file is idempotent: it drops and recreates the
-- eg_app.* tables.
--
-- Prices are stored in the local pump currency unit:
--   US: USD per US gallon
--   UK: GBP per litre
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS eg_app;

DROP TABLE IF EXISTS eg_app.price_history CASCADE;
DROP TABLE IF EXISTS eg_app.price_recommendations CASCADE;
DROP TABLE IF EXISTS eg_app.demand_signals CASCADE;
DROP TABLE IF EXISTS eg_app.competitor_prices CASCADE;
DROP TABLE IF EXISTS eg_app.costs CASCADE;
DROP TABLE IF EXISTS eg_app.fuel_grades CASCADE;
DROP TABLE IF EXISTS eg_app.sites CASCADE;

CREATE TABLE eg_app.fuel_grades (
  grade_id   TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  sort_order INT  NOT NULL
);

CREATE TABLE eg_app.sites (
  site_id   TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  brand     TEXT NOT NULL,
  country   TEXT NOT NULL,
  region    TEXT NOT NULL,
  currency  TEXT NOT NULL,
  unit      TEXT NOT NULL,
  lat       DOUBLE PRECISION NOT NULL,
  lon       DOUBLE PRECISION NOT NULL
);

CREATE TABLE eg_app.costs (
  site_id        TEXT NOT NULL REFERENCES eg_app.sites(site_id),
  grade_id       TEXT NOT NULL REFERENCES eg_app.fuel_grades(grade_id),
  wholesale_cost NUMERIC(6,3) NOT NULL,
  delivery_cost  NUMERIC(6,3) NOT NULL,
  as_of          DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (site_id, grade_id)
);

CREATE TABLE eg_app.competitor_prices (
  id              BIGSERIAL PRIMARY KEY,
  site_id         TEXT NOT NULL REFERENCES eg_app.sites(site_id),
  competitor_name TEXT NOT NULL,
  grade_id        TEXT NOT NULL REFERENCES eg_app.fuel_grades(grade_id),
  price           NUMERIC(6,3) NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE eg_app.demand_signals (
  site_id          TEXT NOT NULL REFERENCES eg_app.sites(site_id),
  grade_id         TEXT NOT NULL REFERENCES eg_app.fuel_grades(grade_id),
  avg_daily_volume INT NOT NULL,
  -- The seeded baseline volume. avg_daily_volume is mutated every simulated day
  -- as demand responds to pricing; this column preserves the day-0 anchor so a
  -- reset can restore volumes to their true starting level (and the engine can
  -- mean-revert to it) instead of locking in a drifted value.
  base_avg_daily_volume INT,
  elasticity       NUMERIC(4,2) NOT NULL,
  trend            TEXT NOT NULL,
  as_of            DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (site_id, grade_id)
);

CREATE TABLE eg_app.price_recommendations (
  id                 BIGSERIAL PRIMARY KEY,
  site_id            TEXT NOT NULL REFERENCES eg_app.sites(site_id),
  grade_id           TEXT NOT NULL REFERENCES eg_app.fuel_grades(grade_id),
  recommended_price  NUMERIC(6,3) NOT NULL,
  rationale          TEXT NOT NULL,
  projected_margin   NUMERIC(10,2),
  projected_volume   INT,
  confidence         NUMERIC(3,2),
  per_agent_notes    JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Simulated day index the recommendation was generated on, so the UI can show
  -- its age on the moving sim clock rather than real wall-clock time.
  sim_day_index      INT
);

CREATE INDEX idx_price_rec_site ON eg_app.price_recommendations(site_id, created_at DESC);

-- Daily price history for the trend chart. `series` is 'EG' for our own pump
-- price, or the competitor name for a rival's series.
CREATE TABLE eg_app.price_history (
  site_id  TEXT NOT NULL REFERENCES eg_app.sites(site_id),
  grade_id TEXT NOT NULL REFERENCES eg_app.fuel_grades(grade_id),
  series   TEXT NOT NULL,
  is_eg    BOOLEAN NOT NULL DEFAULT false,
  day      DATE NOT NULL,
  price    NUMERIC(6,3) NOT NULL,
  PRIMARY KEY (site_id, grade_id, series, day)
);

CREATE INDEX idx_price_history_site ON eg_app.price_history(site_id, grade_id, day);
