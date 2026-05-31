import { NextRequest } from "next/server";
import { pgTransaction } from "@/lib/db/lakebase";
import { APP } from "@/lib/db/env";
import type { GradeId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VALID_GRADES: GradeId[] = ["regular", "premium", "diesel"];

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Apply an EG pump price for a site + grade at the CURRENT simulated day.
 *
 * This is the write path behind the manual price editor and the "Apply
 * recommendation" actions (site page + assistant). It upserts the EG row in
 * `price_history` for `sim_state.sim_date`, which is the canonical source every
 * read uses (map, rollups, history chart, the assistant's network context) and
 * the value the simulation reads as the starting `egPrice` on its next step. So
 * a manual price is a one-time intervention: the sim then evolves the price
 * forward from there each day (mean-reverting toward cost + margin), rather than
 * being permanently pinned.
 *
 * Body: { siteId, gradeId?, price, source?: "manual" | "recommendation" }
 */
export async function POST(req: NextRequest) {
  let body: {
    siteId?: string;
    gradeId?: string;
    price?: number;
    source?: string;
    projectedMargin?: number;
    projectedVolume?: number;
    confidence?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const siteId = body.siteId;
  const gradeId = (body.gradeId ?? "regular") as GradeId;
  const price = Number(body.price);
  const source = body.source === "recommendation" ? "recommendation" : "manual";
  // Optional projection metadata (passed by the assistant/site recommendation
  // card) so the intervention log can compare projected vs realized.
  const projectedMargin =
    body.projectedMargin != null && Number.isFinite(Number(body.projectedMargin))
      ? Number(body.projectedMargin)
      : null;
  const projectedVolume =
    body.projectedVolume != null && Number.isFinite(Number(body.projectedVolume))
      ? Number(body.projectedVolume)
      : null;
  const confidence =
    body.confidence != null && Number.isFinite(Number(body.confidence))
      ? Number(body.confidence)
      : null;

  if (!siteId) return json({ error: "siteId is required" }, 400);
  if (!VALID_GRADES.includes(gradeId)) {
    return json({ error: `invalid grade ${gradeId}` }, 400);
  }
  if (!Number.isFinite(price) || price <= 0) {
    return json({ error: "price must be a positive number" }, 400);
  }

  try {
    const result = await pgTransaction(async (q) => {
      // Resolve the current simulated day + day index (falls back to the latest
      // history day if the sim clock row is somehow missing).
      const clock = await q<{ sim_date: string; day_index: number | null }>(
        `SELECT to_char(COALESCE(
            (SELECT sim_date FROM ${APP("sim_state")} WHERE id = 1),
            (SELECT max(day) FROM ${APP("price_history")} WHERE site_id = $1),
            now()::date
         ), 'YYYY-MM-DD') AS sim_date,
         (SELECT day_index FROM ${APP("sim_state")} WHERE id = 1) AS day_index`,
        [siteId]
      );
      const simDate = clock[0]?.sim_date;
      const dayIndex = clock[0]?.day_index == null ? 0 : Number(clock[0].day_index);
      if (!simDate) throw new Error("could not resolve the simulated date");

      // The EG price this change replaces (for the intervention log).
      const prevRows = await q<{ price: string }>(
        `SELECT price FROM ${APP("price_history")}
          WHERE site_id = $1 AND grade_id = $2 AND is_eg = true AND series = 'EG'
          ORDER BY day DESC LIMIT 1`,
        [siteId, gradeId]
      );
      const oldPrice = prevRows[0]?.price == null ? null : Number(prevRows[0].price);

      // Validate the site exists and read its current unit cost so we can reject
      // selling below cost (a hard guardrail) for the chosen grade. Also pull the
      // site name, current local competitor average and modelled daily volume so
      // the caller can render an applied-confirmation card without a round trip.
      const costRows = await q<{
        unit_cost: string | null;
        name: string | null;
        country: string | null;
        comp_avg: string | null;
        volume: string | null;
      }>(
        `SELECT (c.wholesale_cost + c.delivery_cost) AS unit_cost,
                s.name, s.country,
                (SELECT avg(cp.price) FROM ${APP("competitor_prices")} cp
                  WHERE cp.site_id = $1 AND cp.grade_id = $2) AS comp_avg,
                (SELECT d.avg_daily_volume FROM ${APP("demand_signals")} d
                  WHERE d.site_id = $1 AND d.grade_id = $2) AS volume
           FROM ${APP("costs")} c
           JOIN ${APP("sites")} s ON s.site_id = c.site_id
          WHERE c.site_id = $1 AND c.grade_id = $2`,
        [siteId, gradeId]
      );
      if (!costRows.length) throw new Error(`unknown site/grade ${siteId}/${gradeId}`);
      const unitCost = costRows[0].unit_cost == null ? null : Number(costRows[0].unit_cost);
      const siteName = costRows[0].name ?? siteId;
      const country = costRows[0].country ?? "US";
      const compAvg = costRows[0].comp_avg == null ? null : Number(costRows[0].comp_avg);
      const volume = costRows[0].volume == null ? null : Number(costRows[0].volume);
      if (unitCost != null && price < unitCost) {
        return {
          ok: false as const,
          belowCost: true,
          unitCost,
          simDate,
          siteName,
          country,
        };
      }

      // Upsert the EG pump price for the current simulated day. Round to the
      // grade's currency precision (US 2dp / UK 3dp is enforced at the UI; we
      // store full precision and let reads format).
      await q(
        `INSERT INTO ${APP("price_history")} (site_id, grade_id, series, is_eg, day, price)
         VALUES ($1, $2, 'EG', true, $3::date, $4)
         ON CONFLICT (site_id, grade_id, series, day)
         DO UPDATE SET price = EXCLUDED.price`,
        [siteId, gradeId, simDate, price]
      );

      // Keep the competitor-facing "current EG price" coherent for any reads
      // that still derive from recommendations: stamp a recommendation row too
      // when the change is a manual intervention, so the site's recommendation
      // history reflects the operator action (the agents write their own rows).
      if (source === "manual") {
        await q(
          `INSERT INTO ${APP("price_recommendations")}
             (site_id, grade_id, recommended_price, rationale,
              projected_margin, projected_volume, confidence, per_agent_notes, created_at)
           VALUES ($1, $2, $3, $4, NULL, NULL, NULL, '[]'::jsonb, now())`,
          [
            siteId,
            gradeId,
            price,
            `Manual price set by operator on ${simDate}.`,
          ]
        );
      }

      // Log the intervention for the performance tracker so we can later show
      // projected vs realized impact of this change.
      await q(
        `INSERT INTO ${APP("sim_interventions")}
           (day_index, day, site_id, grade_id, source, old_price, new_price,
            unit_cost, projected_margin, projected_volume, confidence, note)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          dayIndex,
          simDate,
          siteId,
          gradeId,
          source,
          oldPrice,
          price,
          unitCost,
          projectedMargin,
          projectedVolume,
          confidence,
          source === "recommendation"
            ? "Agent recommendation applied by operator."
            : `Manual price set by operator on ${simDate}.`,
        ]
      );

      return {
        ok: true as const,
        simDate,
        siteId,
        siteName,
        country,
        gradeId,
        price,
        oldPrice,
        unitCost,
        compAvg,
        volume,
        margin: unitCost == null ? null : Number((price - unitCost).toFixed(4)),
        source,
      };
    });

    if (!result.ok) {
      return json(
        {
          error: `${result.siteName}: ${price} is below this site's unit cost (${result.unitCost?.toFixed(
            3
          )}/unit). Set a price at or above cost.`,
          belowCost: true,
          unitCost: result.unitCost,
          siteName: result.siteName,
          country: result.country,
        },
        422
      );
    }
    return json(result);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
