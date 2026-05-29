import type { ModelTier } from "@/lib/models";

/**
 * Specialist pricing agents. Each has a focused remit, a scoped set of tools,
 * and a model tier. They run in parallel, each producing a short findings note
 * and a suggested price for the target grade; the orchestrator synthesises.
 */
export interface AgentRole {
  id: string;
  name: string;
  emoji: string;
  tier: ModelTier;
  /** Tools this agent is allowed to call. */
  toolScope: string[];
  /** Role framing injected into the system prompt. */
  systemPromptFrame: string;
}

export const AGENT_ROLES: AgentRole[] = [
  {
    id: "demand",
    name: "Demand Agent",
    emoji: "trend",
    tier: "fast",
    toolScope: ["get_demand", "compute_margin"],
    systemPromptFrame:
      "You are the Demand Agent. You focus on volume and price elasticity. " +
      "Use get_demand to understand current volume, elasticity and trend, and " +
      "compute_margin to test how candidate prices move projected volume. Your " +
      "goal is to find the price that protects or grows volume without giving " +
      "away margin needlessly. Flag if demand is fragile (high elasticity) or " +
      "trending down.",
  },
  {
    id: "competitor",
    name: "Competitor Agent",
    emoji: "compass",
    tier: "fast",
    toolScope: ["get_competitor_prices", "get_site_costs"],
    systemPromptFrame:
      "You are the Competitor Agent. You focus on the local competitive set. " +
      "Use get_competitor_prices to see nearby rivals and get_site_costs for " +
      "context. Recommend where EG should sit relative to competitors (match, " +
      "undercut, or hold a small premium) and justify it. Call out if rivals " +
      "are pricing aggressively.",
  },
  {
    id: "margin",
    name: "Margin Agent",
    emoji: "coins",
    tier: "fast",
    toolScope: ["get_site_costs", "compute_margin", "get_demand"],
    systemPromptFrame:
      "You are the Margin Agent. You focus on profitability. Use get_site_costs " +
      "for unit cost, then compute_margin across candidate prices to find where " +
      "projected daily margin (unit margin x projected volume) is maximised. " +
      "Recommend the profit-optimal price and state the trade-off vs volume.",
  },
  {
    id: "compliance",
    name: "Compliance Agent",
    emoji: "shield",
    tier: "fast",
    toolScope: ["check_compliance", "get_competitor_prices", "get_site_costs"],
    systemPromptFrame:
      "You are the Compliance Agent. You enforce pricing guardrails. Use " +
      "check_compliance on any candidate price to ensure it is never below " +
      "cost, stays within a sane band of competitors, and avoids extreme moves. " +
      "Your recommendation is a constraint: state the acceptable price range and " +
      "veto anything non-compliant.",
  },
];

export const SYNTHESIZER_TIER: ModelTier = "flagship";
