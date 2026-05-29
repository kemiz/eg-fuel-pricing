import { NextRequest } from "next/server";
import { getSiteSnapshot } from "@/lib/data/server";
import { pgQuery } from "@/lib/db/lakebase";
import { APP } from "@/lib/db/env";
import { runPricingAgents, type AgentEvent } from "@/agents/orchestrator";
import type { GradeId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VALID_GRADES: GradeId[] = ["regular", "premium", "diesel"];

/**
 * Run the multi-agent pricing flow for a site/grade and stream agent turns as
 * Server-Sent Events. The final recommendation is persisted to
 * eg_app.price_recommendations.
 *
 * Body: { siteId: string, grade?: "regular" | "premium" | "diesel" }
 */
export async function POST(req: NextRequest) {
  let body: { siteId?: string; grade?: string };
  try {
    body = (await req.json()) as { siteId?: string; grade?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const siteId = body.siteId;
  const grade = (body.grade ?? "regular") as GradeId;
  if (!siteId) {
    return new Response(JSON.stringify({ error: "siteId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!VALID_GRADES.includes(grade)) {
    return new Response(JSON.stringify({ error: `invalid grade ${grade}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const snapshot = await getSiteSnapshot(siteId);
  if (!snapshot) {
    return new Response(JSON.stringify({ error: `unknown site ${siteId}` }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const recommendation = await runPricingAgents(snapshot, grade, send);

        // Persist the recommendation.
        try {
          await pgQuery(
            `INSERT INTO ${APP("price_recommendations")}
               (site_id, grade_id, recommended_price, rationale,
                projected_margin, projected_volume, confidence, per_agent_notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
            [
              recommendation.siteId,
              recommendation.gradeId,
              recommendation.recommendedPrice,
              recommendation.rationale,
              recommendation.projectedMargin,
              recommendation.projectedVolume,
              recommendation.confidence,
              JSON.stringify(recommendation.perAgentNotes),
            ]
          );
          send({ type: "status", message: "Recommendation saved." });
        } catch (e) {
          send({
            type: "status",
            message: `Recommendation produced but not persisted: ${(e as Error).message}`,
          });
        }
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
