"use client";

import { useMemo, useState } from "react";
import { MessageSquare, Sparkles } from "lucide-react";
import type { Site } from "@/lib/types";
import { AgentRoom } from "@/components/AgentRoom";

/**
 * Conversational entry point: ask for a price in natural language, we resolve
 * the site by name/region and open the agent room. Deliberately lightweight —
 * the heavy lifting is the multi-agent run itself.
 */
export function AskBox({ sites }: { sites: Site[] }) {
  const [query, setQuery] = useState("");
  const [activeSite, setActiveSite] = useState<Site | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return sites
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.brand.toLowerCase().includes(q) ||
          s.region.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [query, sites]);

  function resolve() {
    setError(null);
    const q = query.toLowerCase().trim();
    if (!q) return;
    const match =
      sites.find((s) => s.name.toLowerCase().includes(q)) ??
      suggestions[0] ??
      null;
    if (!match) {
      setError("No matching site found. Try a site name, brand, or region.");
      return;
    }
    setActiveSite(match);
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-eg-ink">
        <MessageSquare size={16} className="text-eg-navy" /> Ask the pricing agents
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && resolve()}
            placeholder="e.g. What price for Cumberland Farms Orlando?"
            className="w-full rounded-lg border border-eg-line bg-eg-surface px-3 py-2 text-sm outline-none focus:border-eg-navy"
          />
          {suggestions.length > 0 && !activeSite && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-eg-line bg-eg-surface-raised shadow-lg">
              {suggestions.map((s) => (
                <button
                  key={s.siteId}
                  onClick={() => setActiveSite(s)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-eg-surface-2"
                >
                  <span>{s.name}</span>
                  <span className="text-xs text-eg-ink-soft">
                    {s.brand} · {s.region}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={resolve}
          className="inline-flex items-center gap-1.5 rounded-lg bg-eg-navy px-3 py-2 text-sm font-medium text-white hover:bg-eg-navy-600"
        >
          <Sparkles size={15} /> Run
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-eg-red">{error}</p>}

      {activeSite && (
        <AgentRoom
          site={activeSite}
          open={!!activeSite}
          onClose={() => setActiveSite(null)}
        />
      )}
    </div>
  );
}
