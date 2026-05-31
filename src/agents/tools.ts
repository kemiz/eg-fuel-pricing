import type { GradeId, SiteSnapshot } from "@/lib/types";

/**
 * Pricing tools for the specialist agents.
 *
 * Following the nexus convention, tools are NOT vendor function-calls: they are
 * described in the system prompt and the model emits a JSON block like
 *   ```json
 *   {"tool": "get_competitor_prices", "grade": "regular"}
 *   ```
 * We parse those blocks and execute against the in-memory SiteSnapshot, so a
 * tool call is a cheap local lookup / computation (no DB round trip per call).
 */

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<
    string,
    { type: string; description: string; required?: boolean }
  >;
}

export const TOOL_DEFINITIONS: ToolDef[] = [
  {
    name: "get_site_costs",
    description:
      "Wholesale + delivery cost per unit for each fuel grade at this site.",
    parameters: {
      grade: {
        type: "string",
        description: "Optional grade filter: regular | premium | diesel.",
      },
    },
  },
  {
    name: "get_competitor_prices",
    description:
      "Nearby competitor pump prices per grade, with the competitor name.",
    parameters: {
      grade: {
        type: "string",
        description: "Optional grade filter: regular | premium | diesel.",
      },
    },
  },
  {
    name: "get_demand",
    description:
      "Recent average daily volume, price elasticity, and demand trend per grade.",
    parameters: {
      grade: {
        type: "string",
        description: "Optional grade filter: regular | premium | diesel.",
      },
    },
  },
  {
    name: "compute_margin",
    description:
      "Given a candidate price for a grade, return per-unit margin and the " +
      "projected daily volume + total margin using the demand elasticity.",
    parameters: {
      grade: { type: "string", description: "regular | premium | diesel.", required: true },
      price: { type: "string", description: "Candidate pump price per unit.", required: true },
    },
  },
  {
    name: "check_compliance",
    description:
      "Check a candidate price against simple pricing guardrails (not below " +
      "cost, within a sane band of competitors, no excessive day-over-day move).",
    parameters: {
      grade: { type: "string", description: "regular | premium | diesel.", required: true },
      price: { type: "string", description: "Candidate pump price per unit.", required: true },
    },
  },
];

export function buildToolDescriptions(allowed?: string[]): string {
  const defs = allowed
    ? TOOL_DEFINITIONS.filter((t) => allowed.includes(t.name))
    : TOOL_DEFINITIONS;
  return defs
    .map((t) => {
      const params = Object.entries(t.parameters);
      const paramStr = params.length
        ? `  Parameters: ${params
            .map(
              ([k, v]) =>
                `${k} (${v.type}${v.required ? ", required" : ""}) — ${v.description}`
            )
            .join("; ")}`
        : "  No parameters.";
      return `- ${t.name}: ${t.description}\n${paramStr}`;
    })
    .join("\n");
}

export interface ToolCall {
  tool: string;
  args: Record<string, string>;
  rawMatch: string;
}

/** Parse tool-call JSON blocks out of an LLM response. */
export function parseToolCalls(content: string): ToolCall[] {
  const results: ToolCall[] = [];
  const seen = new Set<string>();

  // Pattern 1: fenced ```json { ... } ``` blocks.
  const fenced = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
  let m: RegExpExecArray | null;
  while ((m = fenced.exec(content)) !== null) {
    tryPush(m[1], m[0]);
  }

  // Pattern 2: bare {"tool": ...} objects on their own.
  const bare = /\{[^{}]*"tool"\s*:\s*"[^"]+"[^{}]*\}/g;
  while ((m = bare.exec(content)) !== null) {
    if (!seen.has(m[0])) tryPush(m[0], m[0]);
  }

  function tryPush(jsonStr: string, raw: string) {
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      if (typeof parsed.tool !== "string") return;
      if (!TOOL_DEFINITIONS.some((t) => t.name === parsed.tool)) return;
      const { tool, ...rest } = parsed;
      const args: Record<string, string> = {};
      for (const [k, v] of Object.entries(rest)) args[k] = String(v);
      const key = `${tool}:${JSON.stringify(args)}`;
      if (seen.has(key)) return;
      seen.add(key);
      seen.add(raw);
      results.push({ tool: tool as string, args, rawMatch: raw });
    } catch {
      /* ignore non-JSON */
    }
  }

  return results;
}

const GRADES: GradeId[] = ["regular", "premium", "diesel"];

function normGrade(g?: string): GradeId | undefined {
  if (!g) return undefined;
  const v = g.toLowerCase().trim();
  return (GRADES as string[]).includes(v) ? (v as GradeId) : undefined;
}

/** Execute a tool against the site snapshot. Returns a JSON-serialisable result. */
export function executeTool(
  call: ToolCall,
  snapshot: SiteSnapshot
): Record<string, unknown> {
  const { site, costs, competitors, demand, egPrices } = snapshot;
  const unit = site.unit;
  const grade = normGrade(call.args.grade);

  switch (call.tool) {
    case "get_site_costs": {
      const rows = costs
        .filter((c) => !grade || c.gradeId === grade)
        .map((c) => ({
          grade: c.gradeId,
          wholesale_cost: c.wholesaleCost,
          delivery_cost: c.deliveryCost,
          unit_cost: Number((c.wholesaleCost + c.deliveryCost).toFixed(3)),
          unit,
        }));
      return { site: site.name, currency: site.currency, costs: rows };
    }

    case "get_competitor_prices": {
      const rows = competitors
        .filter((c) => !grade || c.gradeId === grade)
        .map((c) => ({
          competitor: c.competitorName,
          grade: c.gradeId,
          price: c.price,
          unit,
        }));
      return { site: site.name, currency: site.currency, competitors: rows };
    }

    case "get_demand": {
      const rows = demand
        .filter((d) => !grade || d.gradeId === grade)
        .map((d) => ({
          grade: d.gradeId,
          avg_daily_volume: d.avgDailyVolume,
          // The current pump price the avg_daily_volume is observed AT — the
          // baseline against which any price change moves volume via elasticity.
          current_price: egPrices?.[d.gradeId] ?? null,
          elasticity: d.elasticity,
          trend: d.trend,
        }));
      return { site: site.name, demand: rows };
    }

    case "compute_margin": {
      if (!grade) return { error: "grade is required (regular|premium|diesel)" };
      const price = Number(call.args.price);
      if (!Number.isFinite(price)) return { error: "price must be a number" };
      const cost = costs.find((c) => c.gradeId === grade);
      const dem = demand.find((d) => d.gradeId === grade);
      if (!cost || !dem) return { error: `no data for grade ${grade}` };
      const unitCost = cost.wholesaleCost + cost.deliveryCost;
      const unitMargin = price - unitCost;
      // Project volume from elasticity vs the site's CURRENT pump price, so a
      // proposed price equal to today's price projects today's volume (no
      // phantom change). Fall back to a cost-plus reference only when no current
      // EG price is on record. (Previously this always used cost + typical
      // margin, which made an unchanged price look like a big move.)
      const refMargin = site.country === "US" ? 0.45 : 0.18;
      const currentPrice = egPrices?.[grade];
      const refPrice =
        currentPrice != null && currentPrice > 0 ? currentPrice : unitCost + refMargin;
      const pctPriceChange = refPrice > 0 ? ((price - refPrice) / refPrice) * 100 : 0;
      const pctVolChange = pctPriceChange * dem.elasticity; // elasticity is negative
      const projVolume = Math.max(
        0,
        Math.round(dem.avgDailyVolume * (1 + pctVolChange / 100))
      );
      const totalMargin = Number((unitMargin * projVolume).toFixed(2));
      return {
        grade,
        price,
        unit,
        current_price: currentPrice ?? null,
        reference_price: Number(refPrice.toFixed(3)),
        unit_cost: Number(unitCost.toFixed(3)),
        unit_margin: Number(unitMargin.toFixed(3)),
        projected_daily_volume: projVolume,
        projected_daily_margin: totalMargin,
        currency: site.currency,
      };
    }

    case "check_compliance": {
      if (!grade) return { error: "grade is required (regular|premium|diesel)" };
      const price = Number(call.args.price);
      if (!Number.isFinite(price)) return { error: "price must be a number" };
      const cost = costs.find((c) => c.gradeId === grade);
      if (!cost) return { error: `no cost for grade ${grade}` };
      const unitCost = cost.wholesaleCost + cost.deliveryCost;
      const comps = competitors.filter((c) => c.gradeId === grade).map((c) => c.price);
      const compAvg = comps.length
        ? comps.reduce((a, b) => a + b, 0) / comps.length
        : null;
      const issues: string[] = [];
      if (price <= unitCost) issues.push("Price is at or below total unit cost.");
      if (compAvg != null) {
        const band = site.country === "US" ? 0.4 : 0.15;
        if (price > compAvg + band)
          issues.push(
            `Price is more than ${band} above the competitor average (${compAvg.toFixed(3)}).`
          );
        if (price < compAvg - band)
          issues.push(
            `Price is more than ${band} below the competitor average (${compAvg.toFixed(3)}).`
          );
      }
      return {
        grade,
        price,
        unit,
        compliant: issues.length === 0,
        issues,
        competitor_avg: compAvg == null ? null : Number(compAvg.toFixed(3)),
        unit_cost: Number(unitCost.toFixed(3)),
      };
    }

    default:
      return { error: `unknown tool ${call.tool}` };
  }
}
