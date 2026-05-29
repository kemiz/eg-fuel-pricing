import { NextRequest } from "next/server";
import { chatStreamResponse, type ChatMessage } from "@/lib/databricks";
import { endpointFor } from "@/lib/models";
import {
  getNetworkContext,
  getPriceHistory,
  getSiteSnapshot,
} from "@/lib/data/server";
import type { GradeId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body {
  messages?: { role: "user" | "assistant"; content: string }[];
  /** Optional site the user is currently looking at (adds its snapshot to context). */
  siteId?: string;
}

const SYSTEM = `You are "Ask EG", the conversational data analyst for the EG Group fuel-pricing platform. You answer questions about the EG forecourt network (US EG America banners and UK sites): margins, competitor positioning, demand, and price recommendations.

STYLE
- Be concise and decision-oriented. Lead with the answer, then the supporting detail.
- Use GitHub-flavoured Markdown: short paragraphs, **bold** key numbers, bullet lists, and tables where a comparison helps.
- US prices are USD per gallon (2dp); UK prices are GBP per litre (3dp).

DATA YOU HAVE — do not claim you lack it:
- Per-site REGULAR-grade modelled daily VOLUME (throughput) and price ELASTICITY of demand.
- A pre-computed "MATCH COMPETITION" scenario in the context: for every site currently priced above rivals, it gives current vs projected daily volume and daily margin if we drop price to the competitor average, plus the net margin impact. USE these numbers directly to answer "what's the gain if we match competition" — quantify the volume uplift and the daily margin delta, and call out that matching a higher price downward trades unit margin for volume (net effect depends on elasticity). Sum per-site margin deltas for a network figure.
- Daily figures annualise as x365 if the user wants an annual number (state the assumption).
- When a site is in focus, a PRICE HISTORY block gives ~90 days of weekly-sampled regular-grade prices for EG and the competitor average. Use it to answer "how have prices moved / trended", quote the start→now change and EG's gap to rivals over time, and emit a \`chart:trend\` of the EG series (label by week, e.g. "wk -8") when a trend question is asked.

INLINE VISUALS — embed these fenced blocks directly in your answer wherever a chart or callout makes the point clearer. They render as live widgets.
- Horizontal bar chart (\`Label | value | displayValue | sentiment\`; sentiment optional = good|bad|neutral):
\`\`\`chart:bar
Florida | 0.46 | $0.46 | good
Colorado | 0.41 | $0.41 | neutral
\`\`\`
- Donut/share chart (same row format):
\`\`\`chart:donut
Cheaper than rivals | 38
In line | 12
Dearer | 21
\`\`\`
- Trend/sparkline (\`Label | value\` rows, or a bare list of numbers):
\`\`\`chart:trend
Mon | 3.31
Tue | 3.34
Wed | 3.29
\`\`\`
- Metric tiles (\`Label | value | sentiment\`):
\`\`\`chart:metrics
Avg margin (US) | $0.43 | good
Sites dearer | 21 | bad
\`\`\`
- Callout card (JSON):
\`\`\`card:alert
{"title": "12 sites priced above guardrail", "body": "Mostly North West UK — review compliance.", "tone": "bad"}
\`\`\`
- KPI card (JSON):
\`\`\`card:metric
{"label": "Network sites", "value": "71", "delta": "+9 vs last week", "sentiment": "good"}
\`\`\`

DRILL-DOWN LINKS — make site and region names clickable so the user can jump straight to them:
- A site: [Cumberland Farms Orlando](site:us-fl-cumberlandfarms-4)
- A region: [Florida](region:FL) or [North West](region:North%20West)
Only use site ids that appear in the provided NETWORK context. Prefer linking the first mention of any site or region.

ALWAYS ANSWER THE QUESTION using the data you have. The PER-SITE DETAIL table lets you break any region or brand down by site, rank sites, and explain WHY a region's margin is high or low (e.g. "New Mexico is strongest because its 3 sites carry $0.59-$0.61 margins, well above the US average, while pricing only fractionally above rivals"). When asked to "break it down by site", produce a table of the sites in that region with price, margin, vs-competitor and volume, plus a short explanation and a chart.

ONLY mention the "Run pricing agents" action when the user explicitly asks you to GENERATE A BRAND-NEW recommended price for a specific site (verbs like "optimise this site", "recommend a new price", "what price should we set"). In that case: give your own quick data-driven view first, THEN add one short line that they can click "Run pricing agents" on the site page for the full four-agent recommendation. Do NOT deflect analytical, comparison, or "why/which/how" questions to that action — answer them directly.

FOLLOW-UPS — at the VERY END of every response, add a single HTML comment listing 3 short, specific follow-up questions the user is likely to want next (drill deeper, take an action, or look at a related angle). Keep each label under ~7 words. This comment is hidden from the user and rendered as clickable buttons. Format EXACTLY:
<!-- FOLLOWUPS: ["Break Florida down by site", "Which sites should we reprice?", "Compare to last week"] -->
Make them flow naturally from what you just answered (e.g. if you showed dearer sites, suggest "Match competition on these" or "Optimise the worst offender").

Never invent figures: use the provided NETWORK SNAPSHOT and SITE DETAIL context. If something isn't in context, say so briefly.`;

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const turns = (body.messages ?? []).filter(
    (m) => m.content && (m.role === "user" || m.role === "assistant")
  );
  if (!turns.length) return json({ error: "messages required" }, 400);

  const net = await getNetworkContext();
  let siteDetail = "";
  if (body.siteId) {
    const snap = await getSiteSnapshot(body.siteId);
    if (snap) {
      const grades: GradeId[] = ["regular", "premium", "diesel"];
      const costLines = grades
        .map((g) => {
          const c = snap.costs.find((x) => x.gradeId === g);
          return c
            ? `${g}: cost ${(c.wholesaleCost + c.deliveryCost).toFixed(3)}`
            : null;
        })
        .filter(Boolean)
        .join("; ");
      siteDetail = `\n\nSITE DETAIL — ${snap.site.name} (${snap.site.brand}, ${snap.site.region}, ${snap.site.country}); id=${snap.site.siteId}\nCosts: ${costLines}\nCompetitors: ${snap.competitors
        .slice(0, 8)
        .map((c) => `${c.competitorName} ${c.gradeId} ${c.price}`)
        .join(", ")}`;

      // Weekly-sampled regular price history (EG vs competitor average) so the
      // assistant can answer trend questions without flooding context.
      const hist = await getPriceHistory(body.siteId, "regular", 90);
      if (hist && hist.days.length > 1) {
        const dp = hist.currency === "GBP" ? 3 : 2;
        const eg = hist.series.find((s) => s.isEg);
        const comps = hist.series.filter((s) => !s.isEg);
        const idxs: number[] = [];
        for (let i = hist.days.length - 1; i >= 0; i -= 7) idxs.unshift(i);
        const rows = idxs
          .map((i) => {
            const wk = -(hist.days.length - 1 - i) / 7;
            const egV = eg?.points[i]?.price;
            const compVals = comps
              .map((c) => c.points[i]?.price)
              .filter((v): v is number => Number.isFinite(v));
            const compAvg = compVals.length
              ? compVals.reduce((a, b) => a + b, 0) / compVals.length
              : null;
            if (egV == null || !Number.isFinite(egV)) return null;
            return `wk ${Math.round(wk)}: EG ${egV.toFixed(dp)}${
              compAvg != null ? ` | comp_avg ${compAvg.toFixed(dp)}` : ""
            }`;
          })
          .filter(Boolean)
          .join("\n");
        siteDetail += `\n\nPRICE HISTORY (regular, weekly, ${hist.currency}; wk 0 = today):\n${rows}`;
      }
    }
  }

  const messages: ChatMessage[] = [
    { role: "system", content: `${SYSTEM}\n\n${net.text}${siteDetail}` },
    ...turns.map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
  ];

  let upstream: Response;
  try {
    upstream = await chatStreamResponse(messages, {
      endpoint: endpointFor("flagship"),
      temperature: 0.3,
      maxTokens: 1600,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return json({ error: `Model Serving ${upstream.status}: ${text.slice(0, 300)}` }, 502);
  }

  // Re-emit the upstream SSE as { delta } / [DONE] frames.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let buffer = "";
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const data = JSON.parse(payload);
              const delta =
                data?.choices?.[0]?.delta?.content ??
                data?.choices?.[0]?.message?.content ??
                "";
              if (delta) emit({ delta });
            } catch {
              /* ignore keepalive / non-json */
            }
          }
        }
      } catch (e) {
        emit({ error: (e as Error).message });
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

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
