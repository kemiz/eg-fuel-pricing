import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { getMapData, getRegionRollups } from "@/lib/data/server";
import { Card, PageHeader, Pill, SectionHeader, Stat } from "@/components/ui";
import { PriceMap } from "@/components/PriceMap";
import { RegionMarginChart, PositioningChart } from "@/components/OverviewCharts";
import { regionLabel } from "@/lib/geo";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [us, uk, rollups] = await Promise.all([
    getMapData("US"),
    getMapData("UK"),
    getRegionRollups(),
  ]);

  const allSites = [...us.sites, ...uk.sites];
  const totalSites = allSites.length;
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const avgUsMargin = avg(us.sites.map((s) => s.margin));
  const avgUkMargin = avg(uk.sites.map((s) => s.margin));

  const band = (c: "US" | "UK") => (c === "US" ? 0.05 : 0.02);
  const cheaper = allSites.filter(
    (s) => s.delta != null && s.delta < -band(s.site.country)
  ).length;
  const dearer = allSites.filter(
    (s) => s.delta != null && s.delta > band(s.site.country)
  ).length;
  const inline = totalSites - cheaper - dearer;

  const usRegionBars = rollups
    .filter((r) => r.country === "US" && r.avgMargin != null)
    .sort((a, b) => (b.avgMargin ?? 0) - (a.avgMargin ?? 0))
    .slice(0, 6)
    .map((r) => ({ region: regionLabel("US", r.region), margin: r.avgMargin! }));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="EG Group · Fuel Price Optimisation"
        title="Network overview"
        description="Multi-agent pricing across the EG Group forecourt network — US (EG America banners) and UK."
        asOf="today"
        right={
          <Link
            href="/ask"
            className="inline-flex items-center gap-1.5 rounded-xl bg-eg-red px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-eg-red-600"
          >
            <Sparkles size={15} /> Ask EG
          </Link>
        }
      />

      {/* KPI band */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <Stat label="Sites" value={totalSites} />
          <div className="mt-1 text-xs text-eg-ink-soft">
            {us.sites.length} US · {uk.sites.length} UK
          </div>
        </Card>
        <Card>
          <Stat label="Avg margin (US)" value={formatPrice(avgUsMargin, "USD")} unit="/gal" />
        </Card>
        <Card>
          <Stat label="Avg margin (UK)" value={formatPrice(avgUkMargin, "GBP")} unit="/L" />
        </Card>
        <Card>
          <Stat label="Cheaper than rivals" value={`${cheaper}/${totalSites}`} />
          <div className="mt-1">
            <Pill tone={dearer > cheaper ? "bad" : "good"}>
              {dearer} dearer · {inline} in line
            </Pill>
          </div>
        </Card>
      </div>

      {/* Ask teaser */}
      <Card className="flex flex-col items-start justify-between gap-3 bg-eg-surface-2 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-eg-navy text-white">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="font-semibold text-eg-ink">Ask EG anything about pricing</div>
            <p className="text-sm text-eg-ink-soft">
              &ldquo;Where are we priced above rivals?&rdquo; · &ldquo;Optimise the
              regular price for Turkey Hill Columbus&rdquo; — answered with live charts
              and drill-downs.
            </p>
          </div>
        </div>
        <Link
          href="/ask"
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-eg-navy px-3.5 py-2 text-sm font-medium text-eg-navy hover:bg-eg-navy hover:text-white"
        >
          Open assistant <ArrowRight size={15} />
        </Link>
      </Card>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader
            eyebrow="US · EG America"
            title="Top regions by margin"
            description="Average per-gallon margin on regular grade."
          />
          <div className="mt-3">
            <RegionMarginChart data={usRegionBars} currency="USD" />
          </div>
        </Card>
        <Card>
          <SectionHeader
            eyebrow="Network"
            title="Positioning vs rivals"
            description="How EG sites sit against local competitor averages."
          />
          <div className="mt-3">
            <PositioningChart
              data={[
                { label: "Cheaper", value: cheaper },
                { label: "In line", value: inline },
                { label: "Dearer", value: dearer },
              ]}
            />
          </div>
        </Card>
      </div>

      {/* Map preview */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <SectionHeader
            eyebrow="Network"
            title="Price map"
            description="Shaded by margin. Click a region to drill in."
          />
          <Link
            href="/network"
            className="inline-flex items-center gap-1 text-sm font-medium text-eg-navy hover:underline"
          >
            Full map <ArrowRight size={14} />
          </Link>
        </div>
        <PriceMap initial={us} height={460} />
      </div>
    </div>
  );
}
