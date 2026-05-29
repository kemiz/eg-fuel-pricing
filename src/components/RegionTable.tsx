import Link from "next/link";
import type { RegionRollup } from "@/lib/data/server";
import { Card, Pill, SectionHeader } from "@/components/ui";
import { regionLabel } from "@/lib/geo";
import { formatPrice, unitLabel } from "@/lib/utils";

export function RegionTable({ rollups }: { rollups: RegionRollup[] }) {
  const us = rollups.filter((r) => r.country === "US").sort(byMargin);
  const uk = rollups.filter((r) => r.country === "UK").sort(byMargin);

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="border-b border-eg-line px-5 py-4">
        <SectionHeader
          eyebrow="By region"
          title="Regional pricing rollup"
          description="Average margin and competitor positioning per region. Click a region to drill into the map."
        />
      </div>
      <div className="grid gap-0 md:grid-cols-2 md:divide-x md:divide-eg-line">
        <RegionGroup title="US — EG America" currency="USD" country="US" rows={us} />
        <RegionGroup title="UK" currency="GBP" country="UK" rows={uk} />
      </div>
    </Card>
  );
}

function byMargin(a: RegionRollup, b: RegionRollup) {
  return (b.avgMargin ?? -Infinity) - (a.avgMargin ?? -Infinity);
}

function RegionGroup({
  title,
  currency,
  country,
  rows,
}: {
  title: string;
  currency: string;
  country: "US" | "UK";
  rows: RegionRollup[];
}) {
  return (
    <div>
      <div className="bg-eg-surface-2 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-eg-ink-soft">
        {title}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-eg-ink-soft">
            <th className="px-5 py-2 font-medium">Region</th>
            <th className="px-2 py-2 text-right font-medium">Sites</th>
            <th className="px-2 py-2 text-right font-medium">Avg margin</th>
            <th className="px-5 py-2 text-right font-medium">vs rivals</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const delta =
              r.avgPrice != null && r.avgCompetitor != null
                ? r.avgPrice - r.avgCompetitor
                : null;
            const band = country === "US" ? 0.05 : 0.02;
            const tone =
              delta == null ? "neutral" : delta < -band ? "good" : delta > band ? "bad" : "watch";
            const label =
              delta == null
                ? "—"
                : delta < -band
                  ? "Cheaper"
                  : delta > band
                    ? "Dearer"
                    : "In line";
            return (
              <tr
                key={r.region}
                className="border-t border-eg-line transition-colors hover:bg-eg-surface-2/60"
              >
                <td className="px-5 py-2">
                  <Link
                    href={`/network?region=${encodeURIComponent(r.region)}`}
                    className="font-medium text-eg-ink hover:text-eg-navy"
                  >
                    {regionLabel(country, r.region)}
                  </Link>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-eg-ink-soft">
                  {r.sites}
                </td>
                <td className="kpi-num px-2 py-2 text-right font-semibold text-eg-navy">
                  {formatPrice(r.avgMargin, currency)}
                  <span className="text-[11px] font-normal text-eg-ink-soft">
                    {unitLabel(country)}
                  </span>
                </td>
                <td className="px-5 py-2 text-right">
                  <Pill tone={tone}>{label}</Pill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
