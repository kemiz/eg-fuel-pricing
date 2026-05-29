import { getMapData, getRegionRollups } from "@/lib/data/server";
import { PageHeader } from "@/components/ui";
import { PriceMap } from "@/components/PriceMap";
import { RegionTable } from "@/components/RegionTable";
import type { Country } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const sp = await searchParams;
  const region = sp.region;
  const rollups = await getRegionRollups();

  // If a region is requested, load the country that owns it.
  const owner = rollups.find((r) => r.region === region);
  const country: Country = owner?.country ?? "US";
  const initial = await getMapData(country);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Network"
        title="Network map"
        description="Every EG forecourt shaded by per-unit margin. Scroll to zoom, drag to pan, click a region to drill into its sites, then a marker to open a site."
      />
      <PriceMap initial={initial} focusRegion={region} height={620} />
      <RegionTable rollups={rollups} />
    </div>
  );
}
