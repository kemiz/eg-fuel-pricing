-- ===========================================================================
-- EG Fuel Price Optimisation MVP — schema + synthetic seed data
-- ===========================================================================
-- Idempotent: drops and recreates the eg_app.* tables, then inserts a small
-- synthetic dataset. US sites use EG America banner brands; UK sites use the
-- EG corporate identity. NO real EG / competitor data is used here.
--
-- Prices are stored in the local pump currency unit:
--   US: USD per US gallon
--   UK: GBP per litre
-- Costs follow the same unit so margin = price - (wholesale + delivery).
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS eg_app;

DROP TABLE IF EXISTS eg_app.price_recommendations CASCADE;
DROP TABLE IF EXISTS eg_app.demand_signals CASCADE;
DROP TABLE IF EXISTS eg_app.competitor_prices CASCADE;
DROP TABLE IF EXISTS eg_app.costs CASCADE;
DROP TABLE IF EXISTS eg_app.fuel_grades CASCADE;
DROP TABLE IF EXISTS eg_app.sites CASCADE;

-- ---------------------------------------------------------------------------
-- Reference: fuel grades
-- ---------------------------------------------------------------------------
CREATE TABLE eg_app.fuel_grades (
  grade_id   TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  sort_order INT  NOT NULL
);

INSERT INTO eg_app.fuel_grades (grade_id, label, sort_order) VALUES
  ('regular', 'Regular Unleaded', 1),
  ('premium', 'Premium Unleaded', 2),
  ('diesel',  'Diesel',           3);

-- ---------------------------------------------------------------------------
-- Sites
-- ---------------------------------------------------------------------------
CREATE TABLE eg_app.sites (
  site_id   TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  brand     TEXT NOT NULL,          -- banner brand (US) or "EG" (UK)
  country   TEXT NOT NULL,          -- 'US' | 'UK'
  region    TEXT NOT NULL,          -- US state code or UK region name
  currency  TEXT NOT NULL,          -- 'USD' | 'GBP'
  unit      TEXT NOT NULL,          -- 'gal' | 'litre'
  lat       DOUBLE PRECISION NOT NULL,
  lon       DOUBLE PRECISION NOT NULL
);

INSERT INTO eg_app.sites (site_id, name, brand, country, region, currency, unit, lat, lon) VALUES
  -- US (EG America banners) — seeded first
  ('us-ma-001', 'Cumberland Farms Westborough', 'Cumberland Farms', 'US', 'MA', 'USD', 'gal', 42.2695, -71.6162),
  ('us-ma-002', 'Cumberland Farms Framingham',  'Cumberland Farms', 'US', 'MA', 'USD', 'gal', 42.2793, -71.4162),
  ('us-fl-001', 'Cumberland Farms Orlando',     'Cumberland Farms', 'US', 'FL', 'USD', 'gal', 28.5383, -81.3792),
  ('us-fl-002', 'Cumberland Farms Tampa',       'Cumberland Farms', 'US', 'FL', 'USD', 'gal', 27.9506, -82.4572),
  ('us-ny-001', 'Fastrac Syracuse',             'Fastrac',          'US', 'NY', 'USD', 'gal', 43.0481, -76.1474),
  ('us-pa-001', 'Certified Oil Pittsburgh',     'Certified Oil',    'US', 'PA', 'USD', 'gal', 40.4406, -79.9959),
  ('us-oh-001', 'Turkey Hill Columbus',         'Turkey Hill',      'US', 'OH', 'USD', 'gal', 39.9612, -82.9988),
  ('us-co-001', 'Loaf N Jug Denver',            'Loaf N Jug',       'US', 'CO', 'USD', 'gal', 39.7392, -104.9903),
  -- UK (EG corporate) — seeded second
  ('uk-nw-001', 'EG Bolton Middlebrook',        'EG', 'UK', 'North West',    'GBP', 'litre', 53.5769, -2.4282),
  ('uk-nw-002', 'EG Manchester Trafford',       'EG', 'UK', 'North West',    'GBP', 'litre', 53.4675, -2.3490),
  ('uk-ld-001', 'EG London Brentford',          'EG', 'UK', 'London',        'GBP', 'litre', 51.4875, -0.3090),
  ('uk-wm-001', 'EG Birmingham Aston',          'EG', 'UK', 'West Midlands', 'GBP', 'litre', 52.5036, -1.8794),
  ('uk-yh-001', 'EG Leeds Hunslet',             'EG', 'UK', 'Yorkshire',     'GBP', 'litre', 53.7780, -1.5350),
  ('uk-sc-001', 'EG Glasgow Govan',             'EG', 'UK', 'Scotland',      'GBP', 'litre', 55.8617, -4.3120);

-- ---------------------------------------------------------------------------
-- Costs (latest wholesale + delivery per site/grade)
-- ---------------------------------------------------------------------------
CREATE TABLE eg_app.costs (
  site_id        TEXT NOT NULL REFERENCES eg_app.sites(site_id),
  grade_id       TEXT NOT NULL REFERENCES eg_app.fuel_grades(grade_id),
  wholesale_cost NUMERIC(6,3) NOT NULL,  -- per unit
  delivery_cost  NUMERIC(6,3) NOT NULL,  -- per unit
  as_of          DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (site_id, grade_id)
);

-- US wholesale ~USD/gal, UK ~GBP/litre. Premium +0.30/+0.08, diesel +0.10/+0.05.
INSERT INTO eg_app.costs (site_id, grade_id, wholesale_cost, delivery_cost)
SELECT s.site_id, g.grade_id,
  CASE WHEN s.country = 'US' THEN
    2.95 + (CASE g.grade_id WHEN 'premium' THEN 0.30 WHEN 'diesel' THEN 0.10 ELSE 0 END)
       + (('x' || substr(md5(s.site_id), 1, 4))::bit(16)::int % 20) / 100.0
  ELSE
    1.32 + (CASE g.grade_id WHEN 'premium' THEN 0.08 WHEN 'diesel' THEN 0.05 ELSE 0 END)
       + (('x' || substr(md5(s.site_id), 1, 4))::bit(16)::int % 8) / 100.0
  END AS wholesale_cost,
  CASE WHEN s.country = 'US' THEN 0.12 ELSE 0.04 END AS delivery_cost
FROM eg_app.sites s
CROSS JOIN eg_app.fuel_grades g;

-- ---------------------------------------------------------------------------
-- Competitor prices (nearby competitors per site/grade, with coordinates)
-- ---------------------------------------------------------------------------
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

-- Two competitors per site, each priced around cost + a margin band, jittered.
INSERT INTO eg_app.competitor_prices (site_id, competitor_name, grade_id, price, lat, lon)
SELECT
  s.site_id,
  comp.name,
  g.grade_id,
  ROUND((c.wholesale_cost + c.delivery_cost
    + (CASE WHEN s.country = 'US' THEN 0.45 ELSE 0.18 END)
    + ((('x' || substr(md5(s.site_id || comp.name || g.grade_id), 1, 4))::bit(16)::int % 15) - 7)
        / (CASE WHEN s.country = 'US' THEN 100.0 ELSE 200.0 END)
  )::numeric, 3) AS price,
  s.lat + comp.dlat,
  s.lon + comp.dlon
FROM eg_app.sites s
CROSS JOIN eg_app.fuel_grades g
JOIN eg_app.costs c ON c.site_id = s.site_id AND c.grade_id = g.grade_id
CROSS JOIN (
  VALUES
    ('US', 'Shell',   0.012, 0.010),
    ('US', 'BP',     -0.011, 0.009),
    ('UK', 'Tesco',   0.008, 0.007),
    ('UK', 'BP',     -0.009, 0.006)
) AS comp(country, name, dlat, dlon)
WHERE comp.country = s.country;

-- ---------------------------------------------------------------------------
-- Demand signals (recent volume + price elasticity per site/grade)
-- ---------------------------------------------------------------------------
CREATE TABLE eg_app.demand_signals (
  site_id          TEXT NOT NULL REFERENCES eg_app.sites(site_id),
  grade_id         TEXT NOT NULL REFERENCES eg_app.fuel_grades(grade_id),
  avg_daily_volume INT NOT NULL,           -- units sold per day
  elasticity       NUMERIC(4,2) NOT NULL,  -- % volume change per 1% price change (negative)
  trend            TEXT NOT NULL,          -- 'up' | 'flat' | 'down'
  as_of            DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (site_id, grade_id)
);

INSERT INTO eg_app.demand_signals (site_id, grade_id, avg_daily_volume, elasticity, trend)
SELECT
  s.site_id,
  g.grade_id,
  CASE g.grade_id
    WHEN 'regular' THEN 2200 WHEN 'diesel' THEN 1400 ELSE 700 END
    + (('x' || substr(md5(s.site_id || g.grade_id), 1, 4))::bit(16)::int % 600),
  ROUND((-1.20 - ((('x' || substr(md5(s.site_id || g.grade_id), 1, 3))::bit(12)::int % 80) / 100.0))::numeric, 2),
  (ARRAY['up','flat','down'])[1 + (('x' || substr(md5(s.site_id || g.grade_id), 1, 2))::bit(8)::int % 3)]
FROM eg_app.sites s
CROSS JOIN eg_app.fuel_grades g;

-- ---------------------------------------------------------------------------
-- Price recommendations (agent output; populated at runtime)
-- ---------------------------------------------------------------------------
CREATE TABLE eg_app.price_recommendations (
  id                 BIGSERIAL PRIMARY KEY,
  site_id            TEXT NOT NULL REFERENCES eg_app.sites(site_id),
  grade_id           TEXT NOT NULL REFERENCES eg_app.fuel_grades(grade_id),
  recommended_price  NUMERIC(6,3) NOT NULL,
  rationale          TEXT NOT NULL,
  projected_margin   NUMERIC(8,2),     -- per-unit margin * projected volume
  projected_volume   INT,
  confidence         NUMERIC(3,2),     -- 0..1
  per_agent_notes    JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_rec_site ON eg_app.price_recommendations(site_id, created_at DESC);
