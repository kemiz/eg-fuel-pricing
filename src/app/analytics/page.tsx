import {
  getAnalytics,
  getMapData,
  getPerformance,
  getRegionRollups,
  getSites,
} from "@/lib/data/server";
import { PageHeader } from "@/components/ui";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import type { Country } from "@/lib/types";

export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; region?: string }>;
}) {
  const sp = await searchParams;
  const rollups = await getRegionRollups();

  // The map opens on the country that owns a requested region (deep links from
  // the region table), defaulting to US.
  const owner = sp.region ? rollups.find((r) => r.region === sp.region) : undefined;
  const mapCountry: Country = owner?.country ?? "US";

  const [analytics, mapData, sites, performance] = await Promise.all([
    getAnalytics(60),
    getMapData(mapCountry),
    getSites(),
    getPerformance(),
  ]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 pb-4">
        <PageHeader
          eyebrow="Analytics"
          title="Operator analytics"
          description="The full picture for pricing operators — margin pool, positioning vs rivals, the network map, regional and brand performance, demand elasticity and the live market event log."
          asOf={`${fmtDate(analytics.simDate)} · Day ${analytics.dayIndex}`}
        />
      </div>
      <div className="lg:min-h-0 lg:flex-1">
        <AnalyticsDashboard
          analytics={analytics}
          rollups={rollups}
          mapData={mapData}
          sites={sites}
          performance={performance}
          initialTab={sp.tab}
          focusRegion={sp.region}
        />
      </div>
    </div>
  );
}
