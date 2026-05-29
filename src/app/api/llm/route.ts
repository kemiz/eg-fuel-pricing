import { NextRequest, NextResponse } from "next/server";
import { buildUrl, resolveToken } from "@/lib/databricks";
import { env } from "@/lib/db/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thin proxy to a Databricks Model Serving endpoint. Mirrors the nexus
 * convention: the caller supplies OpenAI-style `messages` (each agent owns its
 * system prompt — `raw`), optionally a `model` endpoint name, and `stream`.
 */
interface LlmRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string; // endpoint name only, e.g. "databricks-claude-sonnet-4-6"
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export async function POST(req: NextRequest) {
  let body: LlmRequest;
  try {
    body = (await req.json()) as LlmRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages[] required" }, { status: 400 });
  }

  const endpoint = body.model
    ? `serving-endpoints/${body.model}/invocations`
    : env.llmEndpoint;

  let token: string;
  try {
    token = await resolveToken();
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }

  const upstream = await fetch(buildUrl(endpoint), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: body.messages,
      max_tokens: body.max_tokens ?? 1500,
      ...(body.temperature != null ? { temperature: body.temperature } : {}),
      ...(body.stream ? { stream: true } : {}),
    }),
  });

  if (body.stream && upstream.body) {
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
