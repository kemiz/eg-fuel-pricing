import "server-only";
import { cache } from "react";
import { pgQuery } from "@/lib/db/lakebase";
import { APP, COST_SERIES } from "@/lib/db/env";
import { getSimEvents, getSimState } from "@/lib/sim/repo";
import { regionLabel } from "@/lib/geo";
import type {
  Cost,
  Country,
  CompetitorPrice,
  DemandSignal,
  FuelGrade,
  GradeId,
  MapData,
  PriceHistory,
  PriceRecommendation,
  PriceSeries,
  Site,
  SiteMapPoint,
  SiteSnapshot,
} from "@/lib/types";

/* -------------------------------------------------------------------------- */
/*  Row mappers                                                               */
/* -------------------------------------------------------------------------- */

function toSite(r: Record<string, unknown>): Site {
  return {
    siteId: r.site_id as string,
    name: r.name as string,
    brand: r.brand as string,
    country: r.country as Country,
    region: r.region as string,
    currency: r.currency as string,
    unit: r.unit as string,
    lat: Number(r.lat),
    lon: Number(r.lon),
  };
}

function toGrade(r: Record<string, unknown>): FuelGrade {
  return {
    gradeId: r.grade_id as GradeId,
    label: r.label as string,
    sortOrder: Number(r.sort_order),
  };
}

function toCost(r: Record<string, unknown>): Cost {
  return {
    siteId: r.site_id as string,
    gradeId: r.grade_id as GradeId,
    wholesaleCost: Number(r.wholesale_cost),
    deliveryCost: Number(r.delivery_cost),
    asOf: String(r.as_of),
  };
}

function toCompetitor(r: Record<string, unknown>): CompetitorPrice {
  return {
    id: Number(r.id),
    siteId: r.site_id as string,
    competitorName: r.competitor_name as string,
    gradeId: r.grade_id as GradeId,
    price: Number(r.price),
    lat: Number(r.lat),
    lon: Number(r.lon),
  };
}

function toDemand(r: Record<string, unknown>): DemandSignal {
  return {
    siteId: r.site_id as string,
    gradeId: r.grade_id as GradeId,
    avgDailyVolume: Number(r.avg_daily_volume),
    elasticity: Number(r.elasticity),
    trend: r.trend as DemandSignal["trend"],
  };
}

function toRecommendation(r: Record<string, unknown>): PriceRecommendation {
  return {
    id: Number(r.id),
    siteId: r.site_id as string,
    gradeId: r.grade_id as GradeId,
    recommendedPrice: Number(r.recommended_price),
    rationale: r.rationale as string,
    projectedMargin: r.projected_margin == null ? null : Number(r.projected_margin),
    projectedVolume: r.projected_volume == null ? null : Number(r.projected_volume),
    confidence: r.confidence == null ? null : Number(r.confidence),
    perAgentNotes: (r.per_agent_notes as PriceRecommendation["perAgentNotes"]) ?? null,
    createdAt: String(r.created_at),
    simDayIndex: r.sim_day_index == null ? null : Number(r.sim_day_index),
  };
}

/* -------------------------------------------------------------------------- */
/*  Getters                                                                   */
/* -------------------------------------------------------------------------- */

export const getGrades = cache(async (): Promise<FuelGrade[]> => {
  const rows = await pgQuery(
    `SELECT grade_id, label, sort_order FROM ${APP("fuel_grades")} ORDER BY sort_order`
  );
  return rows.map(toGrade);
});

export const getSites = cache(async (country?: Country): Promise<Site[]> => {
  const where = country ? `WHERE country = $1` : ``;
  const params = country ? [country] : [];
  const rows = await pgQuery(
    `SELECT site_id, name, brand, country, region, currency, unit, lat, lon
       FROM ${APP("sites")} ${where}
       ORDER BY country, region, name`,
    params
  );
  return rows.map(toSite);
});

export const getSite = cache(async (siteId: string): Promise<Site | null> => {
  const rows = await pgQuery(
    `SELECT site_id, name, brand, country, region, currency, unit, lat, lon
       FROM ${APP("sites")} WHERE site_id = $1`,
    [siteId]
  );
  return rows.length ? toSite(rows[0]) : null;
});

export const getSiteSnapshot = cache(
  async (siteId: string): Promise<SiteSnapshot | null> => {
    const site = await getSite(siteId);
    if (!site) return null;

    const [grades, costRows, compRows, demandRows, recRows, egRows] =
      await Promise.all([
        getGrades(),
        pgQuery(
          `SELECT site_id, grade_id, wholesale_cost, delivery_cost, as_of
             FROM ${APP("costs")} WHERE site_id = $1`,
          [siteId]
        ),
        pgQuery(
          `SELECT id, site_id, competitor_name, grade_id, price, lat, lon
             FROM ${APP("competitor_prices")} WHERE site_id = $1`,
          [siteId]
        ),
        pgQuery(
          `SELECT site_id, grade_id, avg_daily_volume, elasticity, trend
             FROM ${APP("demand_signals")} WHERE site_id = $1`,
          [siteId]
        ),
        pgQuery(
          `SELECT id, site_id, grade_id, recommended_price, rationale,
                  projected_margin, projected_volume, confidence,
                  per_agent_notes, created_at, sim_day_index
             FROM ${APP("price_recommendations")}
            WHERE site_id = $1
            ORDER BY created_at DESC
            LIMIT 12`,
          [siteId]
        ),
        // Current EG pump price per grade — the latest EG history row, which is
        // the live/simulated price the rest of the app uses.
        pgQuery(
          `SELECT DISTINCT ON (grade_id) grade_id, price
             FROM ${APP("price_history")}
            WHERE site_id = $1 AND is_eg = true AND series = 'EG'
            ORDER BY grade_id, day DESC`,
          [siteId]
        ),
      ]);

    const egPrices: Partial<Record<GradeId, number>> = {};
    for (const r of egRows) {
      if (r.price != null) egPrices[r.grade_id as GradeId] = Number(r.price);
    }

    return {
      site,
      grades,
      costs: costRows.map(toCost),
      competitors: compRows.map(toCompetitor),
      demand: demandRows.map(toDemand),
      latestRecommendations: recRows.map(toRecommendation),
      egPrices,
    };
  }
);

export const getRecommendations = cache(
  async (siteId: string): Promise<PriceRecommendation[]> => {
    const rows = await pgQuery(
      `SELECT id, site_id, grade_id, recommended_price, rationale,
              projected_margin, projected_volume, confidence,
              per_agent_notes, created_at, sim_day_index
         FROM ${APP("price_recommendations")}
        WHERE site_id = $1
        ORDER BY created_at DESC`,
      [siteId]
    );
    return rows.map(toRecommendation);
  }
);

/**
 * Daily price history (EG + competitors) for a site/grade over the last
 * `days` days, shaped for the trend chart.
 */
export const getPriceHistory = cache(
  async (
    siteId: string,
    gradeId: GradeId = "regular",
    days = 90
  ): Promise<PriceHistory | null> => {
    const site = await getSite(siteId);
    if (!site) return null;

    // Anchor the window to the SIMULATION clock ("today" in the sim world), not
    // wall-clock now(): the seeded/simulated history lives at the sim date, so
    // the trailing-`days` window must end at sim_date. Fall back to the latest
    // history day if the sim clock row is absent.
    const rows = await pgQuery(
      `WITH anchor AS (
         SELECT COALESCE(
                  (SELECT sim_date FROM ${APP("sim_state")} WHERE id = 1),
                  (SELECT max(day) FROM ${APP("price_history")}
                    WHERE site_id = $1 AND grade_id = $2),
                  now()::date
                ) AS d
       )
       SELECT ph.series, ph.is_eg, to_char(ph.day, 'YYYY-MM-DD') AS day, ph.price
         FROM ${APP("price_history")} ph, anchor a
        WHERE ph.site_id = $1 AND ph.grade_id = $2
          AND ph.series <> $4
          AND ph.day <= a.d
          AND ph.day > a.d - $3::int
        ORDER BY ph.day ASC`,
      [siteId, gradeId, days, COST_SERIES]
    );

    const daySet = new Set<string>();
    const bySeries = new Map<string, { isEg: boolean; points: Map<string, number> }>();
    for (const r of rows) {
      const series = r.series as string;
      const day = r.day as string;
      daySet.add(day);
      let entry = bySeries.get(series);
      if (!entry) {
        entry = { isEg: Boolean(r.is_eg), points: new Map() };
        bySeries.set(series, entry);
      }
      entry.points.set(day, Number(r.price));
    }

    const allDays = Array.from(daySet).sort();
    const series: PriceSeries[] = Array.from(bySeries.entries())
      // EG first, then competitors alphabetically.
      .sort((a, b) => (a[1].isEg ? -1 : b[1].isEg ? 1 : a[0].localeCompare(b[0])))
      .map(([name, e]) => ({
        series: name,
        isEg: e.isEg,
        points: allDays.map((d) => ({ day: d, price: e.points.get(d) ?? NaN })),
      }));

    return {
      siteId,
      gradeId,
      currency: site.currency,
      unit: site.unit,
      days: allDays,
      series,
    };
  }
);

/**
 * Map / dashboard data for a country: every site with its latest regular-grade
 * recommended price (falling back to a modelled price = cost + typical margin),
 * the average nearby competitor regular price, and the resulting delta/margin.
 */
export const getMapData = cache(async (country: Country): Promise<MapData> => {
  const rows = await pgQuery(
    `WITH reg_cost AS (
        SELECT site_id, wholesale_cost + delivery_cost AS unit_cost
          FROM ${APP("costs")} WHERE grade_id = 'regular'
     ),
     reg_comp AS (
        SELECT site_id, avg(price) AS comp_avg
          FROM ${APP("competitor_prices")} WHERE grade_id = 'regular'
         GROUP BY site_id
     ),
     reg_dem AS (
        SELECT site_id, avg_daily_volume, elasticity
          FROM ${APP("demand_signals")} WHERE grade_id = 'regular'
     ),
     latest_rec AS (
        SELECT DISTINCT ON (site_id) site_id, recommended_price
          FROM ${APP("price_recommendations")} WHERE grade_id = 'regular'
         ORDER BY site_id, created_at DESC
     ),
     -- The simulation clock advances EG's own pump price by appending a new
     -- price_history row each day; the newest is_eg row is the live price.
     latest_eg AS (
        SELECT DISTINCT ON (site_id) site_id, price AS eg_price
          FROM ${APP("price_history")} WHERE grade_id = 'regular' AND is_eg = true
         ORDER BY site_id, day DESC
     )
     SELECT s.site_id, s.name, s.brand, s.country, s.region, s.currency, s.unit,
            s.lat, s.lon,
            rc.unit_cost,
            cmp.comp_avg,
            rd.avg_daily_volume,
            rd.elasticity,
            lr.recommended_price,
            le.eg_price
       FROM ${APP("sites")} s
       LEFT JOIN reg_cost  rc  ON rc.site_id  = s.site_id
       LEFT JOIN reg_comp  cmp ON cmp.site_id = s.site_id
       LEFT JOIN reg_dem   rd  ON rd.site_id  = s.site_id
       LEFT JOIN latest_rec lr ON lr.site_id  = s.site_id
       LEFT JOIN latest_eg le  ON le.site_id  = s.site_id
      WHERE s.country = $1
      ORDER BY s.region, s.name`,
    [country]
  );

  const typicalMargin = country === "US" ? 0.45 : 0.18;

  const sites: SiteMapPoint[] = rows.map((r) => {
    const site = toSite(r);
    const unitCost = r.unit_cost == null ? null : Number(r.unit_cost);
    const competitorAvg = r.comp_avg == null ? null : Number(r.comp_avg);
    const egPrice = r.eg_price == null ? null : Number(r.eg_price);
    const rec = r.recommended_price == null ? null : Number(r.recommended_price);
    // EG's live price: the simulated price_history wins, then any recommendation,
    // then a cost-plus fallback so the map always has a number.
    const price =
      egPrice ??
      rec ??
      (unitCost == null ? null : Number((unitCost + typicalMargin).toFixed(3)));
    const delta =
      price != null && competitorAvg != null
        ? Number((price - competitorAvg).toFixed(3))
        : null;
    const margin =
      price != null && unitCost != null ? Number((price - unitCost).toFixed(3)) : null;
    const volume = r.avg_daily_volume == null ? null : Number(r.avg_daily_volume);
    const elasticity = r.elasticity == null ? null : Number(r.elasticity);
    return { site, price, competitorAvg, delta, margin, unitCost, volume, elasticity };
  });

  const compRows = await pgQuery(
    `SELECT cp.id, cp.site_id, cp.competitor_name, cp.grade_id, cp.price, cp.lat, cp.lon
       FROM ${APP("competitor_prices")} cp
       JOIN ${APP("sites")} s ON s.site_id = cp.site_id
      WHERE s.country = $1 AND cp.grade_id = 'regular'`,
    [country]
  );

  return { country, sites, competitors: compRows.map(toCompetitor) };
});

export interface RegionRollup {
  country: Country;
  region: string;
  sites: number;
  avgMargin: number | null;
  avgPrice: number | null;
  avgCompetitor: number | null;
}

/** Per-region rollups for both countries (used by dashboards + the assistant). */
export const getRegionRollups = cache(async (): Promise<RegionRollup[]> => {
  const out: RegionRollup[] = [];
  for (const country of ["US", "UK"] as Country[]) {
    const data = await getMapData(country);
    const byRegion = new Map<string, SiteMapPoint[]>();
    for (const s of data.sites) {
      const arr = byRegion.get(s.site.region) ?? [];
      arr.push(s);
      byRegion.set(s.site.region, arr);
    }
    for (const [region, pts] of byRegion) {
      const margins = pts.map((p) => p.margin).filter((m): m is number => m != null);
      const prices = pts.map((p) => p.price).filter((m): m is number => m != null);
      const comps = pts.map((p) => p.competitorAvg).filter((m): m is number => m != null);
      const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
      out.push({
        country,
        region,
        sites: pts.length,
        avgMargin: avg(margins),
        avgPrice: avg(prices),
        avgCompetitor: avg(comps),
      });
    }
  }
  return out;
});

/**
 * Estimate the daily impact of moving a site's price to a target (e.g. matching
 * the competitor average), using the seeded demand elasticity:
 *   %volume change = %price change x elasticity   (elasticity is negative)
 * Returns current vs projected daily volume + margin and the deltas.
 */
export function matchImpact(p: SiteMapPoint, targetPrice: number) {
  if (
    p.price == null ||
    p.unitCost == null ||
    p.volume == null ||
    p.elasticity == null ||
    p.price <= 0
  ) {
    return null;
  }
  const pctPrice = ((targetPrice - p.price) / p.price) * 100;
  const pctVol = pctPrice * p.elasticity;
  const projVolume = Math.max(0, Math.round(p.volume * (1 + pctVol / 100)));
  const currentMargin = (p.price - p.unitCost) * p.volume;
  const projMargin = (targetPrice - p.unitCost) * projVolume;
  return {
    currentVolume: p.volume,
    projVolume,
    volumeDelta: projVolume - p.volume,
    currentMargin: Number(currentMargin.toFixed(2)),
    projMargin: Number(projMargin.toFixed(2)),
    marginDelta: Number((projMargin - currentMargin).toFixed(2)),
  };
}

/** Compact network summary text + structured rows, for the assistant's context. */
export const getNetworkContext = cache(async (): Promise<{
  text: string;
  sites: { siteId: string; name: string; brand: string; region: string; country: Country }[];
}> => {
  const rollups = await getRegionRollups();
  const [us, uk] = await Promise.all([getMapData("US"), getMapData("UK")]);
  const allSites = [...us.sites, ...uk.sites];

  const fmt = (n: number | null, c: Country) =>
    n == null ? "n/a" : `${c === "US" ? "$" : "£"}${n.toFixed(c === "US" ? 2 : 3)}`;

  const regionLines = rollups
    .map(
      (r) =>
        `- ${r.region} (${r.country}): ${r.sites} sites, avg margin ${fmt(
          r.avgMargin,
          r.country
        )}, avg price ${fmt(r.avgPrice, r.country)}, avg competitor ${fmt(
          r.avgCompetitor,
          r.country
        )}`
    )
    .join("\n");

  const band = (c: Country) => (c === "US" ? 0.05 : 0.02);
  const cheaper = allSites.filter(
    (s) => s.delta != null && s.delta < -band(s.site.country)
  );
  const dearer = allSites.filter(
    (s) => s.delta != null && s.delta > band(s.site.country)
  );

  const volSum = (xs: SiteMapPoint[]) =>
    xs.reduce((a, s) => a + (s.volume ?? 0), 0);
  const usVol = volSum(us.sites);
  const ukVol = volSum(uk.sites);

  // "Match competition" scenario for the sites we're currently dearer on:
  // drop price to the competitor average and estimate volume + margin impact.
  const matchRows = dearer
    .map((s) => {
      const impact = s.competitorAvg != null ? matchImpact(s, s.competitorAvg) : null;
      return impact ? { s, impact } : null;
    })
    .filter((x): x is { s: SiteMapPoint; impact: NonNullable<ReturnType<typeof matchImpact>> } => x != null)
    .sort((a, b) => b.impact.marginDelta - a.impact.marginDelta);

  const matchLines = matchRows
    .map(({ s, impact }) => {
      const c = s.site.country;
      const sym = c === "US" ? "$" : "£";
      return `- ${s.site.name} (${s.site.region}, ${c}) [id=${s.site.siteId}]: price ${fmt(
        s.price,
        c
      )} vs comp ${fmt(s.competitorAvg, c)} (gap +${fmt(s.delta, c)}); vol ${impact.currentVolume}->${impact.projVolume}/day (${impact.volumeDelta >= 0 ? "+" : ""}${impact.volumeDelta}); daily margin ${sym}${impact.currentMargin}->${sym}${impact.projMargin} (${impact.marginDelta >= 0 ? "+" : ""}${sym}${impact.marginDelta})`;
    })
    .join("\n");

  const totalMatchMargin = matchRows.reduce((a, r) => a + r.impact.marginDelta, 0);
  const usMatch = matchRows
    .filter((r) => r.s.site.country === "US")
    .reduce((a, r) => a + r.impact.marginDelta, 0);
  const ukMatch = matchRows
    .filter((r) => r.s.site.country === "UK")
    .reduce((a, r) => a + r.impact.marginDelta, 0);

  // Full per-site table so the assistant can break any region/brand down.
  const siteLines = allSites
    .map((s) => {
      const c = s.site.country;
      return `- ${s.site.name} | ${s.site.brand} | ${s.site.region} ${c} | id=${s.site.siteId} | price ${fmt(
        s.price,
        c
      )} | cost ${fmt(s.unitCost, c)} | margin ${fmt(s.margin, c)} | comp_avg ${fmt(
        s.competitorAvg,
        c
      )} | vs_comp ${s.delta == null ? "n/a" : (s.delta >= 0 ? "+" : "") + fmt(s.delta, c)} | vol ${
        s.volume ?? "n/a"
      } | elasticity ${s.elasticity ?? "n/a"}`;
    })
    .join("\n");

  const text = `NETWORK SNAPSHOT
- Total sites: ${allSites.length} (${us.sites.length} US, ${uk.sites.length} UK)
- Sites cheaper than local rivals: ${cheaper.length}; dearer: ${dearer.length}; in line: ${allSites.length - cheaper.length - dearer.length}
- Total modelled daily volume on regular grade: ${usVol.toLocaleString()} gal (US) + ${ukVol.toLocaleString()} L (UK)
- All per-site figures below are for REGULAR grade. Volumes are modelled avg daily throughput; margin = (price - unit cost) x volume; vs_comp = our price minus local competitor average (negative = we are cheaper).

REGION ROLLUPS:
${regionLines}

PER-SITE DETAIL (use this to break a region/brand down by site, rank sites, or explain WHY a region's margin is high/low — e.g. group these rows by region):
${siteLines}

"MATCH COMPETITION" SCENARIO — for the ${dearer.length} sites currently priced ABOVE local rivals, dropping price to the competitor average. Volume uplift uses each site's demand elasticity.
- Net daily margin impact if we match on all dearer sites: ${totalMatchMargin >= 0 ? "+" : ""}$${usMatch.toFixed(2)} (US) and ${ukMatch >= 0 ? "+" : ""}£${ukMatch.toFixed(2)} (UK)
- Note: matching a higher price DOWN to rivals trades unit margin for volume; whether daily margin rises depends on elasticity. Per-site detail:
${matchLines || "  (none currently dearer)"}`;

  return {
    text,
    sites: allSites.map((s) => ({
      siteId: s.site.siteId,
      name: s.site.name,
      brand: s.site.brand,
      region: s.site.region,
      country: s.site.country,
    })),
  };
});

/* -------------------------------------------------------------------------- */
/*  Operator analytics (full dashboard)                                        */
/* -------------------------------------------------------------------------- */

export interface TrendPoint {
  day: string;
  /** Network-wide avg EG regular price. */
  egPrice: number;
  /** Network-wide avg local competitor regular price. */
  compPrice: number;
  /** Avg per-unit margin (price - unit cost). */
  margin: number;
  /** Total modelled daily fuel margin pool (margin x volume), summed. */
  marginPool: number;
  /** Total modelled daily volume across the country. */
  volume: number;
}

export interface RegionPerf {
  region: string;
  label: string;
  sites: number;
  avgMargin: number;
  avgPrice: number;
  avgCompetitor: number;
  /** price - competitor (negative = cheaper than rivals). */
  delta: number;
  volume: number;
  /** Daily margin pool for the region (margin x volume summed). */
  marginPool: number;
}

export interface BrandPerf {
  brand: string;
  sites: number;
  avgMargin: number;
  volume: number;
  marginPool: number;
}

export interface SiteRank {
  siteId: string;
  name: string;
  brand: string;
  region: string;
  regionLabel: string;
  margin: number;
  price: number;
  delta: number;
  volume: number;
  elasticity: number | null;
  marginPool: number;
}

export interface MarginBucket {
  /** Bucket lower bound (per-unit margin). */
  from: number;
  to: number;
  label: string;
  count: number;
}

export interface ElasticityPoint {
  siteId: string;
  name: string;
  region: string;
  elasticity: number;
  margin: number;
  volume: number;
  delta: number;
}

export interface CountryAnalytics {
  country: Country;
  currency: string;
  unit: string;
  /** Headline KPIs. */
  kpis: {
    sites: number;
    avgMargin: number | null;
    avgPrice: number | null;
    avgDelta: number | null;
    totalVolume: number;
    /** Total modelled daily fuel gross margin (margin x volume). */
    marginPool: number;
    cheaper: number;
    inLine: number;
    dearer: number;
    /** WoW change (last vs 7 days prior) in the daily margin pool, %. */
    marginPoolWowPct: number | null;
    /** WoW change in avg EG price, absolute. */
    priceWow: number | null;
  };
  trend: TrendPoint[];
  /** Sparkline (margin pool) for the KPI header. */
  marginPoolSpark: number[];
  positioning: { label: string; value: number }[];
  regions: RegionPerf[];
  brands: BrandPerf[];
  marginHistogram: MarginBucket[];
  elasticity: ElasticityPoint[];
  topSites: SiteRank[];
  bottomSites: SiteRank[];
}

export interface AnalyticsEvent {
  id: number;
  day: string;
  dayIndex: number;
  scope: "network" | "region" | "site";
  ref?: string;
  kind: string;
  headline: string;
  detail?: string;
  tone: "good" | "bad" | "neutral";
}

/** Minimal site lookup so the event feed can resolve a `ref` to a real site. */
export interface SiteRef {
  siteId: string;
  name: string;
  brand: string;
  region: string;
  regionLabel: string;
  country: Country;
}

export interface Analytics {
  simDate: string;
  dayIndex: number;
  countries: CountryAnalytics[];
  events: AnalyticsEvent[];
  /** siteId -> site metadata, for resolving event refs. */
  siteIndex: Record<string, SiteRef>;
  /** region key -> human label (per country), e.g. "FL" -> "Florida". */
  regionLabels: Record<string, string>;
}

/**
 * Daily network roll-up trend for a country: average EG price, competitor
 * price, per-unit margin, total daily margin pool and total volume, over the
 * last `days` simulated days. Volume is held flat per site at its current
 * modelled daily throughput (the schema only stores the latest volume), so the
 * margin pool moves with price/cost, which is what operators care about.
 */
async function getCountryTrend(
  country: Country,
  days: number
): Promise<TrendPoint[]> {
  const rows = await pgQuery(
    `WITH recent AS (
        SELECT DISTINCT day
          FROM ${APP("price_history")}
         WHERE grade_id = 'regular'
         ORDER BY day DESC
         LIMIT $2
     ),
     -- EG own price per site/day
     eg AS (
        SELECT ph.site_id, ph.day, ph.price
          FROM ${APP("price_history")} ph
          JOIN ${APP("sites")} s ON s.site_id = ph.site_id
         WHERE ph.grade_id = 'regular' AND ph.is_eg = true
           AND s.country = $1
           AND ph.day IN (SELECT day FROM recent)
     ),
     -- competitor average per site/day (exclude the hidden cost series)
     comp AS (
        SELECT ph.site_id, ph.day, avg(ph.price) AS comp_price
          FROM ${APP("price_history")} ph
          JOIN ${APP("sites")} s ON s.site_id = ph.site_id
         WHERE ph.grade_id = 'regular' AND ph.is_eg = false
           AND ph.series <> $3
           AND s.country = $1
           AND ph.day IN (SELECT day FROM recent)
         GROUP BY ph.site_id, ph.day
     ),
     -- per-day unit cost from the hidden cost series (same-day cost so margins
     -- are correct historically)
     daycost AS (
        SELECT ph.site_id, ph.day, ph.price AS unit_cost
          FROM ${APP("price_history")} ph
         WHERE ph.grade_id = 'regular' AND ph.series = $3
           AND ph.day IN (SELECT day FROM recent)
     ),
     -- current cost fallback for any legacy day with no cost series row
     cost AS (
        SELECT site_id, wholesale_cost + delivery_cost AS unit_cost
          FROM ${APP("costs")} WHERE grade_id = 'regular'
     ),
     vol AS (
        SELECT site_id, avg_daily_volume AS volume
          FROM ${APP("demand_signals")} WHERE grade_id = 'regular'
     )
     SELECT to_char(eg.day, 'YYYY-MM-DD') AS day,
            avg(eg.price)                          AS eg_price,
            avg(comp.comp_price)                   AS comp_price,
            avg(eg.price - COALESCE(dc.unit_cost, cost.unit_cost))  AS margin,
            sum((eg.price - COALESCE(dc.unit_cost, cost.unit_cost)) * COALESCE(vol.volume, 0)) AS margin_pool,
            sum(COALESCE(vol.volume, 0))           AS volume
       FROM eg
       LEFT JOIN comp ON comp.site_id = eg.site_id AND comp.day = eg.day
       LEFT JOIN daycost dc ON dc.site_id = eg.site_id AND dc.day = eg.day
       LEFT JOIN cost ON cost.site_id = eg.site_id
       LEFT JOIN vol  ON vol.site_id  = eg.site_id
      GROUP BY eg.day
      ORDER BY eg.day ASC`,
    [country, days, COST_SERIES]
  );

  return rows.map((r) => ({
    day: String(r.day),
    egPrice: Number(r.eg_price),
    compPrice: r.comp_price == null ? Number(r.eg_price) : Number(r.comp_price),
    margin: Number(r.margin),
    marginPool: Number(r.margin_pool),
    volume: Number(r.volume),
  }));
}

function buildCountryAnalytics(
  country: Country,
  points: SiteMapPoint[],
  trend: TrendPoint[]
): CountryAnalytics {
  const currency = country === "US" ? "USD" : "GBP";
  const unit = country === "US" ? "/gal" : "/L";
  const band = country === "US" ? 0.05 : 0.02;

  const num = (xs: (number | null)[]) => xs.filter((x): x is number => x != null);
  const avg = (xs: (number | null)[]) => {
    const v = num(xs);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const sum = (xs: (number | null)[]) => num(xs).reduce((a, b) => a + b, 0);

  const cheaper = points.filter((p) => p.delta != null && p.delta < -band).length;
  const dearer = points.filter((p) => p.delta != null && p.delta > band).length;
  const inLine = points.length - cheaper - dearer;

  const marginPool = points.reduce(
    (a, p) => a + (p.margin != null && p.volume != null ? p.margin * p.volume : 0),
    0
  );

  // WoW: compare the latest trend point to ~7 days earlier.
  const last = trend.at(-1);
  const prior = trend.length > 7 ? trend[trend.length - 8] : trend[0];
  const marginPoolWowPct =
    last && prior && prior.marginPool
      ? ((last.marginPool - prior.marginPool) / prior.marginPool) * 100
      : null;
  const priceWow = last && prior ? last.egPrice - prior.egPrice : null;

  /* ---- Region performance ---- */
  const byRegion = new Map<string, SiteMapPoint[]>();
  for (const p of points) {
    const arr = byRegion.get(p.site.region) ?? [];
    arr.push(p);
    byRegion.set(p.site.region, arr);
  }
  const regions: RegionPerf[] = Array.from(byRegion.entries())
    .map(([region, pts]) => {
      const m = avg(pts.map((p) => p.margin)) ?? 0;
      const price = avg(pts.map((p) => p.price)) ?? 0;
      const comp = avg(pts.map((p) => p.competitorAvg)) ?? 0;
      const volume = sum(pts.map((p) => p.volume));
      const pool = pts.reduce(
        (a, p) => a + (p.margin != null && p.volume != null ? p.margin * p.volume : 0),
        0
      );
      return {
        region,
        label: regionLabel(country, region),
        sites: pts.length,
        avgMargin: m,
        avgPrice: price,
        avgCompetitor: comp,
        delta: price - comp,
        volume,
        marginPool: pool,
      };
    })
    .sort((a, b) => b.marginPool - a.marginPool);

  /* ---- Brand performance ---- */
  const byBrand = new Map<string, SiteMapPoint[]>();
  for (const p of points) {
    const arr = byBrand.get(p.site.brand) ?? [];
    arr.push(p);
    byBrand.set(p.site.brand, arr);
  }
  const brands: BrandPerf[] = Array.from(byBrand.entries())
    .map(([brand, pts]) => ({
      brand,
      sites: pts.length,
      avgMargin: avg(pts.map((p) => p.margin)) ?? 0,
      volume: sum(pts.map((p) => p.volume)),
      marginPool: pts.reduce(
        (a, p) => a + (p.margin != null && p.volume != null ? p.margin * p.volume : 0),
        0
      ),
    }))
    .sort((a, b) => b.marginPool - a.marginPool);

  /* ---- Per-unit margin distribution histogram ---- */
  const margins = num(points.map((p) => p.margin));
  const marginHistogram: MarginBucket[] = (() => {
    if (!margins.length) return [];
    const lo = Math.min(...margins);
    const hi = Math.max(...margins);
    const bins = 8;
    const width = (hi - lo) / bins || 1;
    const symbol = currency === "USD" ? "$" : "£";
    const dp = currency === "GBP" ? 3 : 2;
    const buckets: MarginBucket[] = Array.from({ length: bins }, (_, i) => {
      const from = lo + i * width;
      const to = from + width;
      return {
        from,
        to,
        label: `${symbol}${from.toFixed(dp)}`,
        count: 0,
      };
    });
    for (const m of margins) {
      let idx = Math.floor((m - lo) / width);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      buckets[idx].count += 1;
    }
    return buckets;
  })();

  /* ---- Elasticity vs margin scatter ---- */
  const elasticity: ElasticityPoint[] = points
    .filter(
      (p) => p.elasticity != null && p.margin != null && p.volume != null && p.delta != null
    )
    .map((p) => ({
      siteId: p.site.siteId,
      name: p.site.name,
      region: regionLabel(country, p.site.region),
      elasticity: p.elasticity as number,
      margin: p.margin as number,
      volume: p.volume as number,
      delta: p.delta as number,
    }));

  /* ---- Site ranking by daily margin pool ---- */
  const ranked: SiteRank[] = points
    .filter((p) => p.margin != null && p.volume != null && p.price != null && p.delta != null)
    .map((p) => ({
      siteId: p.site.siteId,
      name: p.site.name,
      brand: p.site.brand,
      region: p.site.region,
      regionLabel: regionLabel(country, p.site.region),
      margin: p.margin as number,
      price: p.price as number,
      delta: p.delta as number,
      volume: p.volume as number,
      elasticity: p.elasticity,
      marginPool: (p.margin as number) * (p.volume as number),
    }))
    .sort((a, b) => b.marginPool - a.marginPool);

  const marginPoolSpark = trend.map((t) => t.marginPool);

  return {
    country,
    currency,
    unit,
    kpis: {
      sites: points.length,
      avgMargin: avg(points.map((p) => p.margin)),
      avgPrice: avg(points.map((p) => p.price)),
      avgDelta: avg(points.map((p) => p.delta)),
      totalVolume: sum(points.map((p) => p.volume)),
      marginPool,
      cheaper,
      inLine,
      dearer,
      marginPoolWowPct,
      priceWow,
    },
    trend,
    marginPoolSpark,
    positioning: [
      { label: "Cheaper", value: cheaper },
      { label: "In line", value: inLine },
      { label: "Dearer", value: dearer },
    ],
    regions,
    brands,
    marginHistogram,
    elasticity,
    topSites: ranked.slice(0, 8),
    bottomSites: ranked.slice(-8).reverse(),
  };
}

/** Full operator analytics: per-country KPIs, trends, breakdowns + events. */
export const getAnalytics = cache(async (days = 60): Promise<Analytics> => {
  const [us, uk, usTrend, ukTrend, simRows, eventRows] = await Promise.all([
    getMapData("US"),
    getMapData("UK"),
    getCountryTrend("US", days),
    getCountryTrend("UK", days),
    pgQuery(
      `SELECT to_char(sim_date, 'YYYY-MM-DD') AS sim_date, day_index
         FROM ${APP("sim_state")} WHERE id = 1`
    ),
    pgQuery(
      `SELECT id, to_char(day, 'YYYY-MM-DD') AS day, day_index,
              scope, ref, kind, headline, detail, tone
         FROM ${APP("sim_events")}
        ORDER BY day_index DESC, id DESC
        LIMIT 24`
    ),
  ]);

  const sim = simRows[0];
  const events: AnalyticsEvent[] = eventRows.map((r) => ({
    id: Number(r.id),
    day: String(r.day),
    dayIndex: Number(r.day_index),
    scope: r.scope as AnalyticsEvent["scope"],
    ref: (r.ref as string) ?? undefined,
    kind: r.kind as string,
    headline: r.headline as string,
    detail: (r.detail as string) ?? undefined,
    tone: r.tone as AnalyticsEvent["tone"],
  }));

  // Lookups so the event feed can name the site/region a `ref` points at.
  const siteIndex: Record<string, SiteRef> = {};
  const regionLabels: Record<string, string> = {};
  for (const p of [...us.sites, ...uk.sites]) {
    siteIndex[p.site.siteId] = {
      siteId: p.site.siteId,
      name: p.site.name,
      brand: p.site.brand,
      region: p.site.region,
      regionLabel: regionLabel(p.site.country, p.site.region),
      country: p.site.country,
    };
    regionLabels[p.site.region] = regionLabel(p.site.country, p.site.region);
  }

  return {
    simDate: sim ? String(sim.sim_date) : new Date().toISOString().slice(0, 10),
    dayIndex: sim ? Number(sim.day_index) : 0,
    countries: [
      buildCountryAnalytics("US", us.sites, usTrend),
      buildCountryAnalytics("UK", uk.sites, ukTrend),
    ],
    events,
    siteIndex,
    regionLabels,
  };
});

/* -------------------------------------------------------------------------- */
/*  Ask EG landing briefing (live cards built from network data)              */
/* -------------------------------------------------------------------------- */

export type CardTone = "good" | "watch" | "bad" | "info";

export interface BriefingCard {
  tone: CardTone;
  eyebrow: string;
  metric?: string;
  label: string;
  detail: string;
  /** Prompt sent to the assistant when the card is clicked. */
  prompt: string;
  /**
   * Real recent time-series for the card's mini chart (oldest -> newest). Grows
   * as the simulation advances, so the sparkline moves with the clock. Omitted
   * when there is no series to show.
   */
  spark?: number[];
}

export interface AskBriefing {
  snapshot: BriefingCard[];
  focus: BriefingCard[];
}

/**
 * Recent daily spark series (EG regular price averages) for the briefing
 * cards, so each mini chart reflects real, simulation-driven movement.
 *
 * Returns the last `days` days, oldest -> newest, keyed by:
 *   - "network"          → network-wide avg EG price
 *   - "US" / "UK"        → per-country avg
 *   - "region:<region>"  → per-region avg (US regions used by focus cards)
 *   - "site:<siteId>"    → an individual site's EG price
 */
const getBriefingSparks = cache(
  async (days = 21): Promise<Map<string, number[]>> => {
    const rows = await pgQuery(
      `WITH recent AS (
         SELECT DISTINCT day
           FROM ${APP("price_history")}
          WHERE grade_id = 'regular' AND is_eg = true
          ORDER BY day DESC
          LIMIT $1
       )
       SELECT to_char(ph.day, 'YYYY-MM-DD') AS day,
              s.country, s.region, ph.site_id, ph.price
         FROM ${APP("price_history")} ph
         JOIN ${APP("sites")} s ON s.site_id = ph.site_id
        WHERE ph.grade_id = 'regular' AND ph.is_eg = true
          AND ph.day IN (SELECT day FROM recent)
        ORDER BY ph.day ASC`,
      [days]
    );

    // Collect per-key sums per day, then average.
    const dayOrder: string[] = [];
    const daySeen = new Set<string>();
    // key -> day -> { sum, n }
    const acc = new Map<string, Map<string, { sum: number; n: number }>>();
    const bump = (key: string, day: string, price: number) => {
      let byDay = acc.get(key);
      if (!byDay) {
        byDay = new Map();
        acc.set(key, byDay);
      }
      const cur = byDay.get(day) ?? { sum: 0, n: 0 };
      cur.sum += price;
      cur.n += 1;
      byDay.set(day, cur);
    };

    for (const r of rows) {
      const day = r.day as string;
      if (!daySeen.has(day)) {
        daySeen.add(day);
        dayOrder.push(day);
      }
      const price = Number(r.price);
      bump("network", day, price);
      bump(r.country as string, day, price);
      bump(`region:${r.region as string}`, day, price);
      bump(`site:${r.site_id as string}`, day, price);
    }

    const out = new Map<string, number[]>();
    for (const [key, byDay] of acc) {
      const series = dayOrder
        .map((d) => {
          const cell = byDay.get(d);
          return cell && cell.n ? cell.sum / cell.n : null;
        })
        .filter((v): v is number => v != null);
      if (series.length > 1) out.set(key, series);
    }
    return out;
  }
);

/** Build the Ask EG landing dashboard cards from the live network data. */
export const getAskBriefing = cache(async (): Promise<AskBriefing> => {
  const [us, uk, rollups, sparks, simEvents, simState] = await Promise.all([
    getMapData("US"),
    getMapData("UK"),
    getRegionRollups(),
    getBriefingSparks(21),
    getSimEvents(12).catch(() => []),
    getSimState().catch(() => null),
  ]);
  const all = [...us.sites, ...uk.sites];
  const band = (c: Country) => (c === "US" ? 0.05 : 0.02);

  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const fmt = (n: number | null, c: Country) =>
    n == null ? "—" : `${c === "US" ? "$" : "£"}${n.toFixed(c === "US" ? 2 : 3)}`;

  const cheaper = all.filter((s) => s.delta != null && s.delta < -band(s.site.country));
  const dearer = all.filter((s) => s.delta != null && s.delta > band(s.site.country));
  const usMargin = avg(us.sites.map((s) => s.margin));
  const ukMargin = avg(uk.sites.map((s) => s.margin));

  // Region extremes for focus cards.
  const usRollups = rollups
    .filter((r) => r.country === "US" && r.avgMargin != null)
    .sort((a, b) => (b.avgMargin ?? 0) - (a.avgMargin ?? 0));
  const bestRegion = usRollups[0];
  const worstRegion = usRollups[usRollups.length - 1];

  // Biggest single overpriced site (most above rivals).
  const mostDear = [...dearer].sort(
    (a, b) => (b.delta ?? 0) - (a.delta ?? 0)
  )[0];

  const snapshot: BriefingCard[] = [
    {
      tone: dearer.length > cheaper.length ? "watch" : "good",
      eyebrow: "Network",
      metric: String(all.length),
      label: "Forecourts live",
      detail: `${us.sites.length} US · ${uk.sites.length} UK · ${cheaper.length} cheaper, ${dearer.length} dearer than rivals`,
      prompt: "Give me a network health summary: margins, and how many sites are cheaper vs dearer than rivals, with a chart.",
      spark: sparks.get("network"),
    },
    {
      tone: "info",
      eyebrow: "Margin · US",
      metric: `${fmt(usMargin, "US")}/gal`,
      label: "Avg US margin",
      detail: "Average per-gallon margin on regular grade across EG America banners.",
      prompt: "Compare average margins across US regions and show the top and bottom performers in a bar chart.",
      spark: sparks.get("US"),
    },
    {
      tone: "info",
      eyebrow: "Margin · UK",
      metric: `${fmt(ukMargin, "UK")}/L`,
      label: "Avg UK margin",
      detail: "Average per-litre margin on regular grade across UK forecourts.",
      prompt: "How do UK regions compare on margin? Show a ranked breakdown with a chart.",
      spark: sparks.get("UK"),
    },
  ];

  // -------------------------------------------------------------------------
  // "Worth a look" is a SCORED candidate pool, not a fixed list. As the
  // simulation advances, fresh market events (price wars, outages, demand
  // swings) and the latest extremes (most-dear site, weakest region) compete
  // for the top slots — so the section genuinely surfaces NEW things over time
  // rather than always showing the same four cards.
  // -------------------------------------------------------------------------
  const siteById = new Map(all.map((s) => [s.site.siteId, s]));
  const regionOf = (region: string) =>
    rollups.find((r) => r.region === region);
  const currentDay = simState?.dayIndex ?? 0;

  type Candidate = BriefingCard & { score: number; dedupe: string };
  const candidates: Candidate[] = [];

  // 1) Recent simulation events — the genuinely new stuff. Freshness + severity
  //    drive the score, so a price war today outranks a static structural card.
  const EVENT_META: Record<
    string,
    { eyebrow: string; tone: CardTone; base: number }
  > = {
    price_war: { eyebrow: "Price war", tone: "bad", base: 70 },
    outage: { eyebrow: "Supply shock", tone: "bad", base: 60 },
    crude_spike: { eyebrow: "Cost spike", tone: "watch", base: 55 },
    demand_swing: { eyebrow: "Demand move", tone: "watch", base: 45 },
  };
  const seenEventKind = new Set<string>();
  for (const ev of simEvents) {
    const meta = EVENT_META[ev.kind];
    if (!meta) continue;
    // Only the freshest instance of each kind/scope, and only recent ones.
    const age = currentDay - ev.dayIndex;
    if (age > 10) continue;
    const dedupe = `event:${ev.kind}:${ev.ref ?? "network"}`;
    if (seenEventKind.has(dedupe)) continue;
    seenEventKind.add(dedupe);

    // Resolve a spark + a useful follow-up prompt for the affected scope.
    let spark: number[] | undefined = sparks.get("network");
    let prompt = `What happened with the ${ev.headline.toLowerCase()} and what should we do about it?`;
    let label = ev.headline;
    if (ev.scope === "site" && ev.ref) {
      const s = siteById.get(ev.ref);
      if (s) {
        spark = sparks.get(`site:${ev.ref}`) ?? spark;
        label = s.site.name;
        prompt = `${ev.headline} at ${s.site.name} — what's the pricing and margin impact, and what should we do?`;
      }
    } else if (ev.scope === "region" && ev.ref) {
      spark = sparks.get(`region:${ev.ref}`) ?? spark;
      label = regionLabel("US", ev.ref);
      prompt = `${ev.headline} — how is it affecting our sites there and how should we respond?`;
    }

    candidates.push({
      tone: meta.tone,
      eyebrow: meta.eyebrow,
      metric: ev.tone === "bad" ? "Alert" : "Watch",
      label,
      detail: ev.detail ?? ev.headline,
      prompt,
      spark,
      dedupe,
      // Newer events score higher (decay ~3 pts/day).
      score: meta.base - age * 3,
    });
  }

  // 2) Pricing risk — sites priced above rivals (scales with how many).
  if (dearer.length > 0) {
    candidates.push({
      tone: "bad",
      eyebrow: "Pricing risk",
      metric: `${dearer.length} sites`,
      label: "Priced above local rivals",
      detail: "These sites risk losing volume. See the margin impact of matching competition.",
      prompt: "What is the gain or loss if we match competition on the sites we are currently priced above rivals? Quantify the volume and daily margin impact per site.",
      spark: sparks.get("network"),
      dedupe: "pricing-risk",
      score: 30 + Math.min(25, dearer.length * 3),
    });
  }

  // 3) Site to review — the single most-overpriced site (scales with the gap).
  if (mostDear && mostDear.delta != null) {
    candidates.push({
      tone: "watch",
      eyebrow: "Site to review",
      metric: `+${fmt(mostDear.delta, mostDear.site.country)}`,
      label: mostDear.site.name,
      detail: `Priced furthest above its local competitor set in ${regionLabel(
        mostDear.site.country,
        mostDear.site.region
      )}.`,
      prompt: `Optimise the regular price for ${mostDear.site.name}`,
      spark: sparks.get(`site:${mostDear.site.siteId}`),
      dedupe: `site:${mostDear.site.siteId}`,
      score:
        28 +
        Math.min(
          24,
          (mostDear.delta / band(mostDear.site.country)) * 6
        ),
    });
  }

  // 4) Strongest region (lower priority; informational anchor).
  if (bestRegion) {
    candidates.push({
      tone: "good",
      eyebrow: "Strongest region",
      metric: `${fmt(bestRegion.avgMargin, "US")}/gal`,
      label: regionLabel("US", bestRegion.region),
      detail: `Best average margin of any US region across ${bestRegion.sites} site(s).`,
      prompt: `Why is ${regionLabel("US", bestRegion.region)} our strongest US region on margin? Break it down by site.`,
      spark: sparks.get(`region:${bestRegion.region}`),
      dedupe: `region:${bestRegion.region}`,
      score: 22,
    });
  }

  // 5) Weakest region — the bigger the shortfall vs the best, the higher.
  if (worstRegion && worstRegion !== bestRegion) {
    const gap =
      bestRegion && worstRegion.avgMargin != null && bestRegion.avgMargin != null
        ? bestRegion.avgMargin - worstRegion.avgMargin
        : 0;
    candidates.push({
      tone: "watch",
      eyebrow: "Weakest region",
      metric: `${fmt(worstRegion.avgMargin, "US")}/gal`,
      label: regionLabel("US", worstRegion.region),
      detail: `Lowest average margin of any US region — worth a pricing review.`,
      prompt: `${regionLabel("US", worstRegion.region)} has our weakest US margins — what's driving it and what should we do?`,
      spark: sparks.get(`region:${worstRegion.region}`),
      dedupe: `region:${worstRegion.region}`,
      score: 26 + Math.min(20, gap * 40),
    });
  }

  // 6) Loss-making sites — any site priced MEANINGFULLY below its own cost is
  //    urgent. A small threshold avoids flagging trivial sub-cent dips that are
  //    just rounding noise around the engine's cost+floor.
  const lossThreshold = (c: Country) => (c === "US" ? 0.03 : 0.02);
  const belowCost = all.filter(
    (s) => s.margin != null && s.margin < -lossThreshold(s.site.country)
  );
  if (belowCost.length > 0) {
    const worst = [...belowCost].sort(
      (a, b) => (a.margin ?? 0) - (b.margin ?? 0)
    )[0];
    candidates.push({
      tone: "bad",
      eyebrow: "Margin alert",
      metric: `${belowCost.length} site${belowCost.length > 1 ? "s" : ""}`,
      label: "Selling below cost",
      detail: `${belowCost.length} site(s) are priced under unit cost right now — led by ${worst.site.name}. Immediate review.`,
      prompt: "Which sites are selling below unit cost and by how much? What price moves restore a positive margin without losing too much volume?",
      spark: sparks.get(`site:${worst.site.siteId}`),
      dedupe: "below-cost",
      score: 90, // top priority — losing money
    });
  }

  // Pick the highest-scoring, de-duplicated candidates (cap at 4 cards).
  const seen = new Set<string>();
  const focus: BriefingCard[] = candidates
    .sort((a, b) => b.score - a.score)
    .filter((c) => {
      if (seen.has(c.dedupe)) return false;
      seen.add(c.dedupe);
      return true;
    })
    .slice(0, 4)
    .map(({ score: _score, dedupe: _dedupe, ...card }) => card);

  return { snapshot, focus };
});

/* -------------------------------------------------------------------------- */
/*  Simulation performance tracker (the "experiment tape")                     */
/* -------------------------------------------------------------------------- */

export interface PerfDay {
  dayIndex: number;
  day: string;
  volume: number;
  revenue: number;
  marginPool: number;
  avgMargin: number;
  avgEgPrice: number;
  avgCompPrice: number | null;
  cheaper: number;
  inLine: number;
  dearer: number;
  cfVolume: number;
  cfMarginPool: number;
  /** Margin pool above the baseline-price counterfactual for the day. */
  upliftMarginPool: number;
}

export interface PerfTotals {
  days: number;
  /** Cumulative actual margin pool over the run. */
  cumMarginPool: number;
  /** Cumulative counterfactual (baseline-price) margin pool. */
  cumCfMarginPool: number;
  /** cumMarginPool − cumCfMarginPool: uplift attributable to active pricing. */
  cumUplift: number;
  upliftPct: number | null;
  cumVolume: number;
  cumRevenue: number;
  avgMargin: number;
  /** Latest day's positioning counts. */
  cheaper: number;
  inLine: number;
  dearer: number;
}

export interface InterventionRow {
  id: number;
  dayIndex: number;
  day: string;
  siteId: string;
  siteName: string;
  brand: string;
  regionLabel: string;
  country: Country;
  gradeId: string;
  source: "manual" | "recommendation" | "agent";
  oldPrice: number | null;
  newPrice: number | null;
  unitCost: number | null;
  projectedMargin: number | null;
  /** Per-unit margin at the moment of the change (newPrice − unitCost). */
  appliedMargin: number | null;
  /**
   * Realized per-unit margin change: avg margin in the `window` days AFTER the
   * change minus the avg margin in the `window` days BEFORE. Null until enough
   * days have elapsed after the change to measure.
   */
  realizedMarginDelta: number | null;
  /** Net price move vs the day before (newPrice − oldPrice). */
  priceDelta: number | null;
  /** Days elapsed in the sim since the change landed. */
  daysSince: number;
  helped: boolean | null;
}

export interface PerformanceData {
  dayIndex: number;
  baselineDate: string;
  countries: { country: Country; currency: string; unit: string; totals: PerfTotals; trend: PerfDay[] }[];
  interventions: InterventionRow[];
}

/**
 * Read the simulation performance tape: per-country cumulative totals, the
 * baseline-price counterfactual uplift, the daily trend, and the intervention
 * log with realized per-unit-margin impact measured from price_history.
 */
export const getPerformance = cache(async (): Promise<PerformanceData> => {
  const sim = await getSimState();

  const [perfRows, intvRows, siteRows] = await Promise.all([
    pgQuery(
      `SELECT day_index, to_char(day, 'YYYY-MM-DD') AS day, country,
              volume, revenue, margin_pool, avg_margin, avg_eg_price, avg_comp_price,
              cheaper, in_line, dearer, cf_volume, cf_margin_pool
         FROM ${APP("sim_daily_perf")}
        ORDER BY day_index ASC`
    ),
    pgQuery(
      `SELECT id, day_index, to_char(day, 'YYYY-MM-DD') AS day, site_id, grade_id,
              source, old_price, new_price, unit_cost, projected_margin,
              projected_volume, confidence
         FROM ${APP("sim_interventions")}
        ORDER BY day_index DESC, id DESC
        LIMIT 60`
    ),
    pgQuery(
      `SELECT site_id, name, brand, country, region FROM ${APP("sites")}`
    ),
  ]);

  const siteMeta = new Map<
    string,
    { name: string; brand: string; country: Country; regionLabel: string }
  >();
  for (const s of siteRows) {
    siteMeta.set(s.site_id as string, {
      name: s.name as string,
      brand: s.brand as string,
      country: s.country as Country,
      regionLabel: regionLabel(s.country as Country, s.region as string),
    });
  }

  // Group daily perf by country (US/UK only — 'ALL' kept for the SimBar chip).
  const byCountry = new Map<string, PerfDay[]>();
  for (const r of perfRows) {
    const c = r.country as string;
    const arr = byCountry.get(c) ?? [];
    const marginPool = Number(r.margin_pool);
    const cfMarginPool = Number(r.cf_margin_pool);
    arr.push({
      dayIndex: Number(r.day_index),
      day: String(r.day),
      volume: Number(r.volume),
      revenue: Number(r.revenue),
      marginPool,
      avgMargin: Number(r.avg_margin),
      avgEgPrice: Number(r.avg_eg_price),
      avgCompPrice: r.avg_comp_price == null ? null : Number(r.avg_comp_price),
      cheaper: Number(r.cheaper),
      inLine: Number(r.in_line),
      dearer: Number(r.dearer),
      cfVolume: Number(r.cf_volume),
      cfMarginPool,
      upliftMarginPool: marginPool - cfMarginPool,
    });
    byCountry.set(c, arr);
  }

  const totalsFor = (trend: PerfDay[]): PerfTotals => {
    const cumMarginPool = trend.reduce((a, d) => a + d.marginPool, 0);
    const cumCfMarginPool = trend.reduce((a, d) => a + d.cfMarginPool, 0);
    const cumVolume = trend.reduce((a, d) => a + d.volume, 0);
    const cumRevenue = trend.reduce((a, d) => a + d.revenue, 0);
    const cumUplift = cumMarginPool - cumCfMarginPool;
    const last = trend[trend.length - 1];
    return {
      days: trend.length,
      cumMarginPool,
      cumCfMarginPool,
      cumUplift,
      upliftPct: cumCfMarginPool > 0 ? (cumUplift / cumCfMarginPool) * 100 : null,
      cumVolume,
      cumRevenue,
      avgMargin: cumVolume > 0 ? cumMarginPool / cumVolume : 0,
      cheaper: last?.cheaper ?? 0,
      inLine: last?.inLine ?? 0,
      dearer: last?.dearer ?? 0,
    };
  };

  const countries = (["US", "UK"] as Country[]).map((country) => {
    const trend = byCountry.get(country) ?? [];
    return {
      country,
      currency: country === "US" ? "USD" : "GBP",
      unit: country === "US" ? "gal" : "L",
      totals: totalsFor(trend),
      trend,
    };
  });

  // Realized per-unit-margin impact per intervention, from the hidden per-day
  // EG price + cost series. We average the per-unit margin in a 7-day window
  // before vs after the change day at that site/grade.
  const WINDOW = 7;
  const interventions: InterventionRow[] = await Promise.all(
    intvRows.map(async (r) => {
      const siteId = r.site_id as string;
      const gradeId = r.grade_id as string;
      const meta = siteMeta.get(siteId);
      const oldPrice = r.old_price == null ? null : Number(r.old_price);
      const newPrice = r.new_price == null ? null : Number(r.new_price);
      const unitCost = r.unit_cost == null ? null : Number(r.unit_cost);
      const dayIndex = Number(r.day_index);
      const day = String(r.day);

      // Per-unit margin window around the change: EG price − same-day cost.
      const marginRows = await pgQuery(
        `WITH eg AS (
            SELECT day, price FROM ${APP("price_history")}
             WHERE site_id = $1 AND grade_id = $2 AND is_eg = true AND series = 'EG'
               AND day BETWEEN $3::date - $5::int AND $3::date + $5::int
         ),
         dc AS (
            SELECT day, price AS unit_cost FROM ${APP("price_history")}
             WHERE site_id = $1 AND grade_id = $2 AND series = $4
               AND day BETWEEN $3::date - $5::int AND $3::date + $5::int
         )
         SELECT to_char(eg.day, 'YYYY-MM-DD') AS day,
                (eg.price - COALESCE(dc.unit_cost, 0)) AS margin,
                (dc.unit_cost IS NOT NULL) AS has_cost
           FROM eg LEFT JOIN dc ON dc.day = eg.day
          ORDER BY eg.day ASC`,
        [siteId, gradeId, day, COST_SERIES, WINDOW]
      );
      let beforeSum = 0,
        beforeN = 0,
        afterSum = 0,
        afterN = 0;
      for (const m of marginRows) {
        if (!m.has_cost) continue;
        const md = String(m.day);
        const margin = Number(m.margin);
        if (md < day) {
          beforeSum += margin;
          beforeN += 1;
        } else if (md > day) {
          afterSum += margin;
          afterN += 1;
        }
      }
      const realizedMarginDelta =
        beforeN > 0 && afterN > 0 ? afterSum / afterN - beforeSum / beforeN : null;

      const appliedMargin =
        newPrice != null && unitCost != null ? newPrice - unitCost : null;
      const priceDelta =
        newPrice != null && oldPrice != null ? newPrice - oldPrice : null;
      const daysSince = sim.dayIndex - dayIndex;
      const helped =
        realizedMarginDelta == null ? null : realizedMarginDelta >= 0;

      return {
        id: Number(r.id),
        dayIndex,
        day,
        siteId,
        siteName: meta?.name ?? siteId,
        brand: meta?.brand ?? "",
        regionLabel: meta?.regionLabel ?? "",
        country: meta?.country ?? "US",
        gradeId,
        source: r.source as InterventionRow["source"],
        oldPrice,
        newPrice,
        unitCost,
        projectedMargin: r.projected_margin == null ? null : Number(r.projected_margin),
        appliedMargin,
        realizedMarginDelta,
        priceDelta,
        daysSince,
        helped,
      };
    })
  );

  return {
    dayIndex: sim.dayIndex,
    baselineDate: sim.baselineDate,
    countries,
    interventions,
  };
});
