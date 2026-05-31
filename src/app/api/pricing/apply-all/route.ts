import { NextRequest } from "next/server";
import { pgTransaction } from "@/lib/db/lakebase";
import { APP } from "@/lib/db/env";
import type { GradeId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_GRADES: GradeId[] = ["regular", "premium", "diesel"];

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Bulk-apply the CURRENT agent recommendations across the network for a grade.
 *
 * For each site whose latest recommendation differs from its live EG price (by
 * more than a rounding epsilon) and is at/above unit cost, this upserts the EG
 * price for the current simulated day and logs a `sim_interventions` row — the
 * SAME write path as the single-site apply, so the performance tracker picks
 * every change up. Below-cost recommendations are skipped (reported, not
 * applied). Returns a per-site summary so the assistant can render a REAL
 * applied-changes card instead of a fabricated one.
 *
 * Body: { grade?: "regular" | "premium" | "diesel" }
 */
export async function POST(req: NextRequest) {
  let body: { grade?: string } = {};
  try {
    body = (await req.json()) as { grade?: string };
  } catch {
    /* empty body is fine — defaults to regular */
  }
  const grade = (body.grade ?? "regular") as GradeId;
  if (!VALID_GRADES.includes(grade)) {
    return json({ error: `invalid grade ${grade}` }, 400);
  }

  try {
    const result = await pgTransaction(async (q) => {
      const clock = await q<{ sim_date: string; day_index: number | null }>(
        `SELECT to_char(COALESCE(
            (SELECT sim_date FROM ${APP("sim_state")} WHERE id = 1),
            (SELECT max(day) FROM ${APP("price_history")}),
            now()::date
         ), 'YYYY-MM-DD') AS sim_date,
         (SELECT day_index FROM ${APP("sim_state")} WHERE id = 1) AS day_index`
      );
      const simDate = clock[0]?.sim_date;
      const dayIndex = clock[0]?.day_index == null ? 0 : Number(clock[0].day_index);
      if (!simDate) throw new Error("could not resolve the current date");

      // Candidate set: latest recommendation per site for this grade, joined to
      // the live EG price + unit cost + site identity. Only rows where a
      // recommendation exists AND it moves the price are acted on.
      const rows = await q<{
        site_id: string;
        name: string | null;
        country: string | null;
        rec_price: string;
        eg_price: string | null;
        unit_cost: string | null;
        projected_margin: string | null;
        projected_volume: string | null;
        confidence: string | null;
      }>(
        `WITH latest_rec AS (
            SELECT DISTINCT ON (site_id) site_id, recommended_price,
                   projected_margin, projected_volume, confidence
              FROM ${APP("price_recommendations")}
             WHERE grade_id = $1
             ORDER BY site_id, created_at DESC
         ),
         latest_eg AS (
            SELECT DISTINCT ON (site_id) site_id, price AS eg_price
              FROM ${APP("price_history")}
             WHERE grade_id = $1 AND is_eg = true AND series = 'EG'
             ORDER BY site_id, day DESC
         )
         SELECT r.site_id, s.name, s.country,
                r.recommended_price AS rec_price,
                le.eg_price,
                (c.wholesale_cost + c.delivery_cost) AS unit_cost,
                r.projected_margin, r.projected_volume, r.confidence
           FROM latest_rec r
           JOIN ${APP("sites")} s ON s.site_id = r.site_id
           LEFT JOIN latest_eg le ON le.site_id = r.site_id
           LEFT JOIN ${APP("costs")} c
             ON c.site_id = r.site_id AND c.grade_id = $1`,
        [grade]
      );

      const applied: {
        siteId: string;
        siteName: string;
        country: string;
        oldPrice: number | null;
        newPrice: number;
        unitCost: number | null;
        margin: number | null;
      }[] = [];
      const skipped: { siteId: string; siteName: string; reason: string }[] = [];

      for (const r of rows) {
        const recPrice = Number(r.rec_price);
        const egPrice = r.eg_price == null ? null : Number(r.eg_price);
        const unitCost = r.unit_cost == null ? null : Number(r.unit_cost);
        const siteName = r.name ?? r.site_id;
        const country = r.country ?? "US";
        // Currency precision: US 2dp, UK 3dp.
        const dp = country === "UK" ? 3 : 2;
        const eps = country === "UK" ? 0.0005 : 0.005;

        if (!Number.isFinite(recPrice) || recPrice <= 0) continue;
        if (unitCost != null && recPrice < unitCost) {
          skipped.push({ siteId: r.site_id, siteName, reason: "below unit cost" });
          continue;
        }
        // No-op if the recommendation matches the live price already.
        if (egPrice != null && Math.abs(recPrice - egPrice) < eps) continue;

        const price = Number(recPrice.toFixed(dp));
        await q(
          `INSERT INTO ${APP("price_history")} (site_id, grade_id, series, is_eg, day, price)
           VALUES ($1, $2, 'EG', true, $3::date, $4)
           ON CONFLICT (site_id, grade_id, series, day)
           DO UPDATE SET price = EXCLUDED.price`,
          [r.site_id, grade, simDate, price]
        );
        await q(
          `INSERT INTO ${APP("sim_interventions")}
             (day_index, day, site_id, grade_id, source, old_price, new_price,
              unit_cost, projected_margin, projected_volume, confidence, note)
           VALUES ($1, $2::date, $3, $4, 'recommendation', $5, $6, $7, $8, $9, $10, $11)`,
          [
            dayIndex,
            simDate,
            r.site_id,
            grade,
            egPrice,
            price,
            unitCost,
            r.projected_margin == null ? null : Number(r.projected_margin),
            r.projected_volume == null ? null : Number(r.projected_volume),
            r.confidence == null ? null : Number(r.confidence),
            "Bulk-applied agent recommendation across the network.",
          ]
        );
        applied.push({
          siteId: r.site_id,
          siteName,
          country,
          oldPrice: egPrice,
          newPrice: price,
          unitCost,
          margin: unitCost == null ? null : Number((price - unitCost).toFixed(4)),
        });
      }

      return { ok: true as const, simDate, dayIndex, grade, applied, skipped };
    });

    return json(result);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
