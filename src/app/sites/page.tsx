import { getMapData } from "@/lib/data/server";
import { PageHeader } from "@/components/ui";
import { SitesWorkspace } from "@/components/SitesWorkspace";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const [us, uk] = await Promise.all([getMapData("US"), getMapData("UK")]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Sites"
        description="The full EG forecourt network. Filter by country, banner brand or region, then open a site to see its costs, competitors and pricing history — or run the pricing agents."
      />
      <SitesWorkspace us={us.sites} uk={uk.sites} />
    </div>
  );
}
