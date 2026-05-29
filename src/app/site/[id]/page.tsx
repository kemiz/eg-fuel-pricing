import { notFound } from "next/navigation";
import { getSiteSnapshot } from "@/lib/data/server";
import { SiteDetail } from "@/components/SiteDetail";

export const dynamic = "force-dynamic";

export default async function SitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const snapshot = await getSiteSnapshot(id);
  if (!snapshot) notFound();
  return <SiteDetail snapshot={snapshot} />;
}
