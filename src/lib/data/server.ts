import "server-only";
import { cache } from "react";
import { pgQuery } from "@/lib/db/lakebase";
import { APP } from "@/lib/db/env";
import type {
  Cost,
  Country,
  CompetitorPrice,
  DemandSignal,
  FuelGrade,
  GradeId,
  MapData,
  PriceRecommendation,
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

    const [grades, costRows, compRows, demandRows, recRows] = await Promise.all([
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
                per_agent_notes, created_at
           FROM ${APP("price_recommendations")}
          WHERE site_id = $1
          ORDER BY created_at DESC
          LIMIT 12`,
        [siteId]
      ),
    ]);

    return {
      site,
      grades,
      costs: costRows.map(toCost),
      competitors: compRows.map(toCompetitor),
      demand: demandRows.map(toDemand),
      latestRecommendations: recRows.map(toRecommendation),
    };
  }
);

export const getRecommendations = cache(
  async (siteId: string): Promise<PriceRecommendation[]> => {
    const rows = await pgQuery(
      `SELECT id, site_id, grade_id, recommended_price, rationale,
              projected_margin, projected_volume, confidence,
              per_agent_notes, created_at
         FROM ${APP("price_recommendations")}
        WHERE site_id = $1
        ORDER BY created_at DESC`,
      [siteId]
    );
    return rows.map(toRecommendation);
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
     latest_rec AS (
        SELECT DISTINCT ON (site_id) site_id, recommended_price
          FROM ${APP("price_recommendations")} WHERE grade_id = 'regular'
         ORDER BY site_id, created_at DESC
     )
     SELECT s.site_id, s.name, s.brand, s.country, s.region, s.currency, s.unit,
            s.lat, s.lon,
            rc.unit_cost,
            cmp.comp_avg,
            lr.recommended_price
       FROM ${APP("sites")} s
       LEFT JOIN reg_cost  rc  ON rc.site_id  = s.site_id
       LEFT JOIN reg_comp  cmp ON cmp.site_id = s.site_id
       LEFT JOIN latest_rec lr ON lr.site_id  = s.site_id
      WHERE s.country = $1
      ORDER BY s.region, s.name`,
    [country]
  );

  const typicalMargin = country === "US" ? 0.45 : 0.18;

  const sites: SiteMapPoint[] = rows.map((r) => {
    const site = toSite(r);
    const unitCost = r.unit_cost == null ? null : Number(r.unit_cost);
    const competitorAvg = r.comp_avg == null ? null : Number(r.comp_avg);
    const rec = r.recommended_price == null ? null : Number(r.recommended_price);
    const price =
      rec ?? (unitCost == null ? null : Number((unitCost + typicalMargin).toFixed(3)));
    const delta =
      price != null && competitorAvg != null
        ? Number((price - competitorAvg).toFixed(3))
        : null;
    const margin =
      price != null && unitCost != null ? Number((price - unitCost).toFixed(3)) : null;
    return { site, price, competitorAvg, delta, margin };
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
