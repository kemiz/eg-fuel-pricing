import "server-only";
import { cache } from "react";
import { pgQuery } from "@/lib/db/lakebase";
import { APP } from "@/lib/db/env";
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

    const rows = await pgQuery(
      `SELECT series, is_eg, to_char(day, 'YYYY-MM-DD') AS day, price
         FROM ${APP("price_history")}
        WHERE site_id = $1 AND grade_id = $2
          AND day >= now()::date - $3::int
        ORDER BY day ASC`,
      [siteId, gradeId, days]
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
     )
     SELECT s.site_id, s.name, s.brand, s.country, s.region, s.currency, s.unit,
            s.lat, s.lon,
            rc.unit_cost,
            cmp.comp_avg,
            rd.avg_daily_volume,
            rd.elasticity,
            lr.recommended_price
       FROM ${APP("sites")} s
       LEFT JOIN reg_cost  rc  ON rc.site_id  = s.site_id
       LEFT JOIN reg_comp  cmp ON cmp.site_id = s.site_id
       LEFT JOIN reg_dem   rd  ON rd.site_id  = s.site_id
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
}

export interface AskBriefing {
  snapshot: BriefingCard[];
  focus: BriefingCard[];
}

/** Build the Ask EG landing dashboard cards from the live network data. */
export const getAskBriefing = cache(async (): Promise<AskBriefing> => {
  const [us, uk, rollups] = await Promise.all([
    getMapData("US"),
    getMapData("UK"),
    getRegionRollups(),
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
    },
    {
      tone: "info",
      eyebrow: "Margin · US",
      metric: `${fmt(usMargin, "US")}/gal`,
      label: "Avg US margin",
      detail: "Average per-gallon margin on regular grade across EG America banners.",
      prompt: "Compare average margins across US regions and show the top and bottom performers in a bar chart.",
    },
    {
      tone: "info",
      eyebrow: "Margin · UK",
      metric: `${fmt(ukMargin, "UK")}/L`,
      label: "Avg UK margin",
      detail: "Average per-litre margin on regular grade across UK forecourts.",
      prompt: "How do UK regions compare on margin? Show a ranked breakdown with a chart.",
    },
  ];

  const focus: BriefingCard[] = [];

  if (dearer.length > 0) {
    focus.push({
      tone: "bad",
      eyebrow: "Pricing risk",
      metric: `${dearer.length} sites`,
      label: "Priced above local rivals",
      detail: "These sites risk losing volume. See the margin impact of matching competition.",
      prompt: "What is the gain or loss if we match competition on the sites we are currently priced above rivals? Quantify the volume and daily margin impact per site.",
    });
  }

  if (mostDear) {
    focus.push({
      tone: "watch",
      eyebrow: "Site to review",
      metric: `+${fmt(mostDear.delta, mostDear.site.country)}`,
      label: mostDear.site.name,
      detail: `Priced furthest above its local competitor set in ${regionLabel(
        mostDear.site.country,
        mostDear.site.region
      )}.`,
      prompt: `Optimise the regular price for ${mostDear.site.name}`,
    });
  }

  if (bestRegion) {
    focus.push({
      tone: "good",
      eyebrow: "Strongest region",
      metric: `${fmt(bestRegion.avgMargin, "US")}/gal`,
      label: regionLabel("US", bestRegion.region),
      detail: `Best average margin of any US region across ${bestRegion.sites} site(s).`,
      prompt: `Why is ${regionLabel("US", bestRegion.region)} our strongest US region on margin? Break it down by site.`,
    });
  }

  if (worstRegion && worstRegion !== bestRegion) {
    focus.push({
      tone: "watch",
      eyebrow: "Weakest region",
      metric: `${fmt(worstRegion.avgMargin, "US")}/gal`,
      label: regionLabel("US", worstRegion.region),
      detail: `Lowest average margin of any US region — worth a pricing review.`,
      prompt: `${regionLabel("US", worstRegion.region)} has our weakest US margins — what's driving it and what should we do?`,
    });
  }

  return { snapshot, focus };
});
