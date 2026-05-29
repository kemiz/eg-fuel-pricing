import "server-only";
import { chat, type ChatMessage } from "@/lib/databricks";
import { endpointFor } from "@/lib/models";
import type { GradeId, SiteSnapshot, AgentNote } from "@/lib/types";
import { AGENT_ROLES, SYNTHESIZER_TIER, type AgentRole } from "./roles";
import {
  buildToolDescriptions,
  executeTool,
  parseToolCalls,
} from "./tools";

const MAX_TOOL_TURNS = 3;

/* -------------------------------------------------------------------------- */
/*  Streamed events                                                           */
/* -------------------------------------------------------------------------- */

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "agent_start"; agent: string; role: string }
  | { type: "agent_tool"; agent: string; tool: string; args: Record<string, string> }
  | { type: "agent_message"; agent: string; role: string; content: string }
  | { type: "recommendation"; recommendation: FinalRecommendation }
  | { type: "error"; message: string };

export type EmitFn = (event: AgentEvent) => void | Promise<void>;

export interface FinalRecommendation {
  siteId: string;
  gradeId: GradeId;
  recommendedPrice: number;
  rationale: string;
  projectedMargin: number | null;
  projectedVolume: number | null;
  confidence: number | null;
  perAgentNotes: AgentNote[];
}

/* -------------------------------------------------------------------------- */
/*  Single specialist run                                                     */
/* -------------------------------------------------------------------------- */

function specialistSystemPrompt(
  role: AgentRole,
  snapshot: SiteSnapshot,
  grade: GradeId
): string {
  const { site } = snapshot;
  const gradeLabel =
    snapshot.grades.find((g) => g.gradeId === grade)?.label ?? grade;
  return `${role.systemPromptFrame}

SITE CONTEXT
- Site: ${site.name} (${site.brand})
- Location: ${site.region}, ${site.country}
- Pricing unit: ${site.currency} per ${site.unit}
- Target grade: ${gradeLabel} (${grade})

You can call tools by emitting a JSON block, one per line, like:
\`\`\`json
{"tool": "tool_name", "grade": "${grade}", "price": "1.45"}
\`\`\`

AVAILABLE TOOLS
${buildToolDescriptions(role.toolScope)}

PROCESS
1. Call the tools you need to gather evidence (you have up to ${MAX_TOOL_TURNS} tool turns).
2. When you have enough, respond with your FINAL findings as a single JSON block:
\`\`\`json
{"suggested_price": 1.45, "confidence": 0.7, "note": "one or two sentences explaining your view"}
\`\`\`
Keep the note concise and specific to your remit. Always include suggested_price as a number.`;
}

interface SpecialistResult {
  agentId: string;
  agentName: string;
  suggestedPrice: number | null;
  confidence: number | null;
  note: string;
}

function parseFinal(content: string): {
  suggestedPrice: number | null;
  confidence: number | null;
  note: string;
} {
  const fenced = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
  let m: RegExpExecArray | null;
  let last: Record<string, unknown> | null = null;
  while ((m = fenced.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(m[1]) as Record<string, unknown>;
      if ("suggested_price" in parsed || "note" in parsed) last = parsed;
    } catch {
      /* ignore */
    }
  }
  if (!last) {
    // Fall back to a bare object search.
    const bare = content.match(/\{[\s\S]*"suggested_price"[\s\S]*\}/);
    if (bare) {
      try {
        last = JSON.parse(bare[0]) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }
  }
  const note =
    (last?.note as string) ??
    content.replace(/```[\s\S]*?```/g, "").trim().slice(0, 400) ??
    "";
  const sp = last?.suggested_price;
  const conf = last?.confidence;
  return {
    suggestedPrice: typeof sp === "number" ? sp : sp != null ? Number(sp) : null,
    confidence: typeof conf === "number" ? conf : conf != null ? Number(conf) : null,
    note,
  };
}

async function runSpecialist(
  role: AgentRole,
  snapshot: SiteSnapshot,
  grade: GradeId,
  emit: EmitFn
): Promise<SpecialistResult> {
  await emit({ type: "agent_start", agent: role.name, role: role.id });

  const messages: ChatMessage[] = [
    { role: "system", content: specialistSystemPrompt(role, snapshot, grade) },
    {
      role: "user",
      content: `Analyse the ${grade} price for this site and give your recommendation.`,
    },
  ];

  let finalContent = "";

  for (let turn = 0; turn <= MAX_TOOL_TURNS; turn++) {
    let reply: string;
    try {
      reply = await chat(messages, {
        endpoint: endpointFor(role.tier),
        temperature: 0.2,
        maxTokens: 900,
      });
    } catch (e) {
      await emit({ type: "error", message: `${role.name}: ${(e as Error).message}` });
      return {
        agentId: role.id,
        agentName: role.name,
        suggestedPrice: null,
        confidence: null,
        note: `Unavailable (${(e as Error).message}).`,
      };
    }

    finalContent = reply;
    const calls = parseToolCalls(reply).filter((c) =>
      role.toolScope.includes(c.tool)
    );

    // Surface the agent's narrative (sans raw tool JSON) to the room.
    const narrative = reply.replace(/```[\s\S]*?```/g, "").trim();
    if (narrative) {
      await emit({
        type: "agent_message",
        agent: role.name,
        role: role.id,
        content: narrative,
      });
    }

    if (calls.length === 0 || turn === MAX_TOOL_TURNS) break;

    const resultParts: string[] = [];
    for (const call of calls) {
      await emit({
        type: "agent_tool",
        agent: role.name,
        tool: call.tool,
        args: call.args,
      });
      const result = executeTool(call, snapshot);
      resultParts.push(
        `Result of ${call.tool}(${JSON.stringify(call.args)}):\n${JSON.stringify(result)}`
      );
    }

    messages.push({ role: "assistant", content: reply });
    messages.push({
      role: "user",
      content: `${resultParts.join("\n\n")}\n\nContinue, or give your FINAL findings JSON now.`,
    });
  }

  const parsed = parseFinal(finalContent);
  return {
    agentId: role.id,
    agentName: role.name,
    suggestedPrice: parsed.suggestedPrice,
    confidence: parsed.confidence,
    note: parsed.note,
  };
}

/* -------------------------------------------------------------------------- */
/*  Synthesis                                                                 */
/* -------------------------------------------------------------------------- */

function synthSystemPrompt(snapshot: SiteSnapshot, grade: GradeId): string {
  const { site } = snapshot;
  return `You are the EG Pricing Coordinator. Four specialist agents (Demand, Competitor, Margin, Compliance) have each analysed the ${grade} fuel price for ${site.name} (${site.region}, ${site.country}). Synthesise their input into ONE recommended pump price.

Rules:
- Respect the Compliance Agent's guardrails strictly (never below cost; within band of competitors).
- Balance Margin (profit) against Demand (volume) and the Competitor positioning.
- Pricing unit is ${site.currency} per ${site.unit}.

Respond with EXACTLY one JSON block and nothing else:
\`\`\`json
{
  "recommended_price": <number>,
  "confidence": <0..1 number>,
  "rationale": "<2-3 sentences explaining the decision and the trade-off>"
}
\`\`\``;
}

async function synthesise(
  snapshot: SiteSnapshot,
  grade: GradeId,
  specialists: SpecialistResult[]
): Promise<{ price: number; confidence: number; rationale: string }> {
  const findings = specialists
    .map(
      (s) =>
        `${s.agentName}: suggested_price=${s.suggestedPrice ?? "n/a"}, confidence=${
          s.confidence ?? "n/a"
        }, note=${s.note}`
    )
    .join("\n");

  const reply = await chat(
    [
      { role: "system", content: synthSystemPrompt(snapshot, grade) },
      { role: "user", content: `Specialist findings:\n${findings}` },
    ],
    { endpoint: endpointFor(SYNTHESIZER_TIER), temperature: 0.1, maxTokens: 600 }
  );

  const fenced = reply.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const raw = fenced ? fenced[1] : reply.match(/\{[\s\S]*\}/)?.[0];
  let parsed: Record<string, unknown> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }

  // Fallbacks: median of specialist suggestions if the synthesiser failed.
  const suggestions = specialists
    .map((s) => s.suggestedPrice)
    .filter((p): p is number => p != null && Number.isFinite(p))
    .sort((a, b) => a - b);
  const median = suggestions.length
    ? suggestions[Math.floor(suggestions.length / 2)]
    : 0;

  const price =
    parsed.recommended_price != null
      ? Number(parsed.recommended_price)
      : median;
  const confidence =
    parsed.confidence != null ? Number(parsed.confidence) : 0.5;
  const rationale =
    (parsed.rationale as string) ??
    "Synthesised from the specialist agents' suggestions.";

  return {
    price: Number(price.toFixed(3)),
    confidence: Math.max(0, Math.min(1, confidence)),
    rationale,
  };
}

/* -------------------------------------------------------------------------- */
/*  Public entry point                                                        */
/* -------------------------------------------------------------------------- */

export async function runPricingAgents(
  snapshot: SiteSnapshot,
  grade: GradeId,
  emit: EmitFn
): Promise<FinalRecommendation> {
  await emit({
    type: "status",
    message: `Convening ${AGENT_ROLES.length} specialist agents for ${snapshot.site.name}…`,
  });

  // Run specialists in parallel.
  const specialists = await Promise.all(
    AGENT_ROLES.map((role) => runSpecialist(role, snapshot, grade, emit))
  );

  await emit({ type: "status", message: "Coordinator synthesising final price…" });

  const synth = await synthesise(snapshot, grade, specialists);

  // Project volume + margin at the final price using the same model as the tool.
  const cost = snapshot.costs.find((c) => c.gradeId === grade);
  const dem = snapshot.demand.find((d) => d.gradeId === grade);
  let projectedVolume: number | null = null;
  let projectedMargin: number | null = null;
  if (cost && dem) {
    const unitCost = cost.wholesaleCost + cost.deliveryCost;
    const refMargin = snapshot.site.country === "US" ? 0.45 : 0.18;
    const refPrice = unitCost + refMargin;
    const pctPriceChange = refPrice > 0 ? ((synth.price - refPrice) / refPrice) * 100 : 0;
    const pctVolChange = pctPriceChange * dem.elasticity;
    projectedVolume = Math.max(
      0,
      Math.round(dem.avgDailyVolume * (1 + pctVolChange / 100))
    );
    projectedMargin = Number(((synth.price - unitCost) * projectedVolume).toFixed(2));
  }

  const recommendation: FinalRecommendation = {
    siteId: snapshot.site.siteId,
    gradeId: grade,
    recommendedPrice: synth.price,
    rationale: synth.rationale,
    projectedMargin,
    projectedVolume,
    confidence: synth.confidence,
    perAgentNotes: specialists.map((s) => ({
      agent: s.agentName,
      note:
        s.suggestedPrice != null
          ? `Suggested ${s.suggestedPrice} — ${s.note}`
          : s.note,
    })),
  };

  await emit({ type: "recommendation", recommendation });
  return recommendation;
}
