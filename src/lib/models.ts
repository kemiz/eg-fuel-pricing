import { env } from "@/lib/db/env";

/**
 * Model Serving endpoints powering the pricing agents.
 *
 * - `flagship` synthesises the final recommendation (more capable model).
 * - `fast` runs the specialist analyst agents (cheaper / quicker).
 *
 * Stored as endpoint *paths* (serving-endpoints/<name>/invocations) so the
 * Databricks client can build the full URL. Override via EG_LLM_ENDPOINT /
 * EG_LLM_FAST_ENDPOINT.
 */
export const MODELS = {
  flagship: env.llmEndpoint,
  fast: env.llmFastEndpoint,
} as const;

export type ModelTier = keyof typeof MODELS;

export function endpointFor(tier: ModelTier): string {
  return MODELS[tier];
}

/** Extract the bare endpoint name from a `serving-endpoints/<name>/invocations` path. */
export function endpointName(path: string): string {
  const m = path.match(/serving-endpoints\/([^/]+)\/invocations/);
  return m ? m[1] : path;
}
