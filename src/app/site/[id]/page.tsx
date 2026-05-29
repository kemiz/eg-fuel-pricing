import { notFound } from "next/navigation";
import { getPriceHistory, getSiteSnapshot } from "@/lib/data/server";
import { SiteDetail } from "@/components/SiteDetail";

export const dynamic = "force-dynamic";

export default async function SitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [snapshot, priceHistory] = await Promise.all([
    getSiteSnapshot(id),
    getPriceHistory(id, "regular", 90),
  ]);
  if (!snapshot) notFound();
  return <SiteDetail snapshot={snapshot} priceHistory={priceHistory} />;
}
