import { notFound } from "next/navigation";
import { getPriceHistory, getSiteSnapshot } from "@/lib/data/server";
import { SiteDetail } from "@/components/SiteDetail";
import type { GradeId, PriceHistory } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const snapshot = await getSiteSnapshot(id);
  if (!snapshot) notFound();

  // Load price history for every grade the site has, so the chart can switch
  // between Regular / Premium / Diesel without a round-trip.
  const histories = await Promise.all(
    snapshot.grades.map((g) => getPriceHistory(id, g.gradeId, 90))
  );
  const priceHistories: Partial<Record<GradeId, PriceHistory>> = {};
  snapshot.grades.forEach((g, i) => {
    const h = histories[i];
    if (h && h.days.length > 1) priceHistories[g.gradeId] = h;
  });

  return <SiteDetail snapshot={snapshot} priceHistories={priceHistories} />;
}
