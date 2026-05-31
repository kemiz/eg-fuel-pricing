import { NextRequest } from "next/server";
import { chatStreamResponse, type ChatMessage } from "@/lib/databricks";
import { endpointFor } from "@/lib/models";
import {
  getNetworkContext,
  getPerformance,
  getPriceHistory,
  getSiteSnapshot,
} from "@/lib/data/server";
import { getSimState } from "@/lib/sim/repo";
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

DATE / "TODAY": The CURRENT DATE line in the context gives today's date — treat THAT as "today". All "now/today/this week/recently/latest" references, and the PRICE HISTORY (where wk 0 = today), are relative to that date. Use it for every time reference and never substitute a different date. Never mention simulations, models, test data, or that this is a demo — speak as the live EG pricing platform operating on real forecourt data.

LENGTH DISCIPLINE (HARD RULES — these OVERRIDE any user request to list "all"/"every" item) — keep every answer complete and self-contained; never let a table or sentence get cut off.
- Show at most 8 rows TOTAL across all tables in a response. Even if the user says "show every/all sites", show the 8 most relevant (e.g. biggest margin delta) and add one line like "+ 14 more — ask to see a specific region" instead of listing them all. Never exceed 8 rows; never split into multiple long tables to get around this.
- Use ONE focused table per answer. Put secondary detail in a short bullet summary or a \`chart:bar\`, not a second table.
- Keep the whole response under ~450 words so it always finishes, INCLUDING the closing FOLLOWUPS comment, which is mandatory and must always be the last thing you output. Tighten prose, drop redundant columns, and round numbers to make room.
- If you sense you are running long, stop adding rows/detail and wrap up with the FOLLOWUPS comment rather than truncating mid-table.

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

APPLYING / CHANGING PRICES — the platform CAN apply prices to the forecourt directly. A request to set or apply a SPECIFIC price for a site (e.g. "apply $3.38 to Nashville", "set regular to 1.45 at <site>") is handled automatically — the price is committed and an applied-confirmation card is shown to the user; you do NOT need to (and should not) describe how to do it manually or mention any "Set EG price" card. If the user instead asks WHAT price to set (advice, not a specific number), give your data-driven view and suggest a price; they can then say "apply $X" to commit it. Never claim you lack write access, and never refer to a "simulation" or "simulated day" — applied prices go live immediately.

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

  const [net, sim, perf] = await Promise.all([
    getNetworkContext(),
    getSimState().catch(() => null),
    getPerformance().catch(() => null),
  ]);

  // Clock anchor so the model treats the platform's current date as "today".
  let clockLine = "";
  if (sim) {
    const pretty = new Date(`${sim.simDate}T00:00:00Z`).toLocaleDateString(
      "en-GB",
      { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
    );
    clockLine = `CURRENT DATE — today is ${pretty} (${sim.simDate}). Treat this as "today" for all time references.\n\n`;
  }

  // Performance tape: cumulative results over the run + uplift vs holding
  // baseline prices, and how applied price changes landed. Lets the assistant
  // answer "how are we performing overall" with real numbers.
  let perfLine = "";
  if (perf && perf.dayIndex > 0) {
    const fmtM = (v: number, cur: string) => {
      const sym = cur === "USD" ? "$" : "£";
      const abs = Math.abs(v);
      const s = abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(abs / 1e3).toFixed(0)}k` : abs.toFixed(0);
      return `${v < 0 ? "−" : ""}${sym}${s}`;
    };
    const countryLines = perf.countries
      .filter((c) => c.totals.days > 0)
      .map((c) => {
        const t = c.totals;
        const upPct = t.upliftPct != null ? ` (${t.cumUplift >= 0 ? "+" : "−"}${Math.abs(t.upliftPct).toFixed(1)}%)` : "";
        return `${c.country}: cumulative margin pool ${fmtM(t.cumMarginPool, c.currency)} over ${t.days}d; uplift vs holding baseline prices flat ${fmtM(t.cumUplift, c.currency)}${upPct}; run avg margin ${c.currency === "USD" ? "$" : "£"}${t.avgMargin.toFixed(c.currency === "GBP" ? 3 : 2)}/${c.unit}`;
      })
      .join("\n");
    const measured = perf.interventions.filter((i) => i.helped != null);
    const helped = measured.filter((i) => i.helped).length;
    const recent = perf.interventions
      .slice(0, 6)
      .map((i) => {
        const sym = i.country === "US" ? "$" : "£";
        const dp = i.country === "US" ? 2 : 3;
        const impact =
          i.realizedMarginDelta == null
            ? "measuring"
            : `${i.realizedMarginDelta >= 0 ? "improved" : "hurt"} margin by ${sym}${Math.abs(i.realizedMarginDelta).toFixed(dp)}/unit`;
        const newP = i.newPrice != null ? `${sym}${i.newPrice.toFixed(dp)}` : "?";
        return `- ${i.siteName} (${i.regionLabel}), ${i.source}, set ${newP} → ${impact}`;
      })
      .join("\n");
    perfLine = `PERFORMANCE (tracking period to date, ${perf.dayIndex} days):\n${countryLines}${
      measured.length
        ? `\nApplied price changes: ${helped}/${measured.length} measured changes improved per-unit margin.`
        : ""
    }${recent ? `\nRecent applied changes:\n${recent}` : ""}\n\nThe UPLIFT is the extra fuel margin vs holding starting prices flat — i.e. the value the active pricing has added. Use these real figures when asked how we're doing overall. Refer to the period as "since we started tracking" or by date, never as a "simulation".\n\n`;
  }

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
    { role: "system", content: `${SYSTEM}\n\n${clockLine}${perfLine}${net.text}${siteDetail}` },
    ...turns.map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
  ];

  let upstream: Response;
  try {
    upstream = await chatStreamResponse(messages, {
      endpoint: endpointFor("flagship"),
      temperature: 0.3,
      maxTokens: 4000,
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
