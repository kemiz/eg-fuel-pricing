import "server-only";
import { env } from "@/lib/db/env";

/**
 * Databricks Model Serving client.
 *
 * Token resolution (in priority order):
 *   1. OAuth client credentials (DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET)
 *   2. Environment PAT (DATABRICKS_TOKEN / ...)
 *   3. SDK auth via the workspace profile (local dev / Apps SP)
 *
 * All agents call a serving endpoint with the OpenAI-style chat completions
 * shape: { messages, max_tokens, temperature, stream? }.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  endpoint?: string; // serving-endpoints/<name>/invocations
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

let _cachedToken: { token: string; expiresAt: number } | null = null;

export function databricksHost(): string {
  return (
    env.databricksHost ||
    process.env.DATABRICKS_HOST ||
    "https://fe-vm-alice.cloud.databricks.com"
  ).replace(/\/$/, "");
}

export function buildUrl(endpoint: string): string {
  const host = databricksHost();
  const clean = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  return `${host}/${clean}`;
}

async function oauthToken(): Promise<string | null> {
  if (!process.env.DATABRICKS_CLIENT_ID || !process.env.DATABRICKS_CLIENT_SECRET) {
    return null;
  }
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAt > now + 60_000) {
    return _cachedToken.token;
  }
  const res = await fetch(`${databricksHost()}/oidc/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.DATABRICKS_CLIENT_ID,
      client_secret: process.env.DATABRICKS_CLIENT_SECRET,
      scope: "all-apis",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  _cachedToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

async function sdkToken(): Promise<string | null> {
  try {
    if (!process.env.DATABRICKS_CONFIG_PROFILE && env.databricksProfile) {
      process.env.DATABRICKS_CONFIG_PROFILE = env.databricksProfile;
    }
    if (!process.env.DATABRICKS_HOST && env.databricksHost) {
      process.env.DATABRICKS_HOST = env.databricksHost;
    }
    const { WorkspaceClient } = await import("@databricks/sdk-experimental");
    const w = new WorkspaceClient({});
    const headers = new Headers();
    await w.config.authenticate(headers);
    const auth = headers.get("Authorization") ?? headers.get("authorization");
    return auth ? auth.replace(/^Bearer /i, "") : null;
  } catch {
    return null;
  }
}

export async function resolveToken(): Promise<string> {
  const oauth = await oauthToken();
  if (oauth) return oauth;

  const envToken =
    process.env.DATABRICKS_TOKEN ||
    process.env.DATABRICKS_WORKSPACE_TOKEN ||
    process.env.DATABRICKS_ACCESS_TOKEN;
  if (envToken) return envToken;

  const sdk = await sdkToken();
  if (sdk) return sdk;

  throw new Error(
    "No Databricks credentials. Set DATABRICKS_TOKEN, OAuth client creds, " +
      "or a DATABRICKS_PROFILE for SDK auth."
  );
}

/** Non-streaming chat completion. Returns the assistant message content. */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const endpoint = options.endpoint ?? env.llmEndpoint;
  const url = buildUrl(endpoint);
  const token = await resolveToken();

  const body: Record<string, unknown> = {
    messages,
    max_tokens: options.maxTokens ?? 1500,
  };
  // Some reasoning models reject an explicit temperature; Claude/most accept it.
  if (options.temperature != null) body.temperature = options.temperature;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Model Serving error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  return (
    data?.choices?.[0]?.message?.content?.trim() ??
    data?.choices?.[0]?.text?.trim() ??
    ""
  );
}

/**
 * Streaming chat completion. Returns the upstream SSE Response body so callers
 * (e.g. /api/llm) can pipe it straight through.
 */
export async function chatStreamResponse(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<Response> {
  const endpoint = options.endpoint ?? env.llmEndpoint;
  const url = buildUrl(endpoint);
  const token = await resolveToken();

  const body: Record<string, unknown> = {
    messages,
    max_tokens: options.maxTokens ?? 1500,
    stream: true,
  };
  if (options.temperature != null) body.temperature = options.temperature;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
  });
}
