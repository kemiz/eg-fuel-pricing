import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The network map now lives as a sub-tab under Analytics. Preserve any
 * deep-linked region so existing links (and the region table) still work.
 */
export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const { region } = await searchParams;
  const params = new URLSearchParams({ tab: "map" });
  if (region) params.set("region", region);
  redirect(`/analytics?${params.toString()}`);
}
