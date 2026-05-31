"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Wand2, AlertTriangle } from "lucide-react";
import type { GradeId, SiteSnapshot } from "@/lib/types";
import { formatPrice, unitLabel } from "@/lib/utils";

interface RowState {
  value: string;
  status: "idle" | "saving" | "saved" | "error";
  message?: string;
}

/**
 * Manual price control for a site: shows the current EG pump price per grade,
 * lets the operator set a new price (validated against unit cost server-side),
 * and one-click-applies the latest agent recommendation when one exists. Writes
 * go through POST /api/pricing/apply, then router.refresh() repaints the page
 * (and the change-flash highlights what moved), consistent with the simulation.
 */
export function PriceEditor({ snapshot }: { snapshot: SiteSnapshot }) {
  const router = useRouter();
  const { site, grades, costs, egPrices, latestRecommendations } = snapshot;
  const dp = site.country === "US" ? 2 : 3;

  // Latest recommendation per grade (recommendations are newest-first).
  const latestRecByGrade = useMemo(() => {
    const m = new Map<GradeId, number>();
    for (const r of latestRecommendations) {
      if (!m.has(r.gradeId)) m.set(r.gradeId, r.recommendedPrice);
    }
    return m;
  }, [latestRecommendations]);

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const rowFor = (g: GradeId): RowState => rows[g] ?? { value: "", status: "idle" };
  const setRow = (g: GradeId, patch: Partial<RowState>) =>
    setRows((r) => ({ ...r, [g]: { ...rowFor(g), ...patch } }));

  async function apply(gradeId: GradeId, price: number, source: "manual" | "recommendation") {
    if (!Number.isFinite(price) || price <= 0) {
      setRow(gradeId, { status: "error", message: "Enter a valid price." });
      return;
    }
    setRow(gradeId, { status: "saving", message: undefined });
    try {
      const res = await fetch("/api/pricing/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: site.siteId, gradeId, price, source }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRow(gradeId, {
          status: "error",
          message: data.error ?? `Failed (${res.status})`,
        });
        return;
      }
      setRow(gradeId, { status: "saved", value: "", message: undefined });
      router.refresh();
      // Clear the saved tick after a moment.
      setTimeout(() => setRow(gradeId, { status: "idle" }), 2200);
    } catch (e) {
      setRow(gradeId, { status: "error", message: (e as Error).message });
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-eg-line px-4 py-3 text-sm font-semibold text-eg-ink">
        Set EG price
      </div>
      <div className="divide-y divide-eg-line">
        {grades.map((g) => {
          const gid = g.gradeId;
          const cost = costs.find((c) => c.gradeId === gid);
          const unitCost = cost ? cost.wholesaleCost + cost.deliveryCost : null;
          const current = egPrices[gid] ?? null;
          const rec = latestRecByGrade.get(gid) ?? null;
          const row = rowFor(gid);
          const margin =
            current != null && unitCost != null ? current - unitCost : null;

          return (
            <div key={gid} className="px-4 py-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-medium capitalize text-eg-ink">
                    {g.label}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="kpi-num text-lg font-bold text-eg-navy">
                      {current != null ? formatPrice(current, site.currency) : "—"}
                      <span className="text-xs font-medium text-eg-ink-soft">
                        {unitLabel(site.country)}
                      </span>
                    </span>
                    {margin != null && (
                      <span className="text-[11px] text-eg-ink-soft">
                        margin {formatPrice(margin, site.currency)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex flex-col">
                    <label className="mb-1 text-[10px] uppercase tracking-wide text-eg-ink-soft">
                      New price
                    </label>
                    <div className="flex items-center gap-1.5">
                      <div className="eg-tile flex items-center rounded-lg px-2 py-1.5">
                        <span className="text-xs text-eg-ink-soft">
                          {site.currency === "USD" ? "$" : "£"}
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step={dp === 2 ? "0.01" : "0.001"}
                          min="0"
                          value={row.value}
                          onChange={(e) =>
                            setRow(gid, { value: e.target.value, status: "idle" })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              void apply(gid, Number(row.value), "manual");
                          }}
                          placeholder={current != null ? current.toFixed(dp) : "0.00"}
                          className="w-20 bg-transparent text-right text-sm tabular-nums outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void apply(gid, Number(row.value), "manual")}
                        disabled={row.status === "saving" || !row.value}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-eg-navy to-eg-navy-700 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-eg-navy/25 transition-all hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                      >
                        {row.status === "saving" ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : row.status === "saved" ? (
                          <Check size={13} />
                        ) : null}
                        {row.status === "saved" ? "Applied" : "Apply"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {rec != null && rec !== current && (
                <button
                  type="button"
                  onClick={() => void apply(gid, rec, "recommendation")}
                  disabled={row.status === "saving"}
                  className="eg-chip mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-eg-navy hover:brightness-105 disabled:opacity-40"
                >
                  <Wand2 size={12} />
                  Apply agent recommendation: {formatPrice(rec, site.currency)}
                  {unitLabel(site.country)}
                </button>
              )}

              {row.status === "error" && row.message && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-eg-red">
                  <AlertTriangle size={12} className="shrink-0" />
                  {row.message}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
