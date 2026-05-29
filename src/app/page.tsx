import { getMapData } from "@/lib/data/server";
import { PriceMap } from "@/components/PriceMap";
import { SiteList } from "@/components/SiteList";
import { AskBox } from "@/components/AskBox";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [us, uk] = await Promise.all([getMapData("US"), getMapData("UK")]);

  const allSites = [...us.sites, ...uk.sites];
  const totalSites = allSites.length;
  const usMargins = us.sites.map((s) => s.margin).filter((m): m is number => m != null);
  const ukMargins = uk.sites.map((s) => s.margin).filter((m): m is number => m != null);
  const avgUsMargin = usMargins.length
    ? usMargins.reduce((a, b) => a + b, 0) / usMargins.length
    : null;
  const avgUkMargin = ukMargins.length
    ? ukMargins.reduce((a, b) => a + b, 0) / ukMargins.length
    : null;
  const cheaperThanComp = allSites.filter((s) => s.delta != null && s.delta < 0).length;
  const allSiteRecords = allSites.map((s) => s.site);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-eg-ink">Fuel Price Optimisation</h1>
        <p className="text-sm text-eg-ink-soft">
          Multi-agent pricing across the EG Group forecourt network — US (EG America
          banners) and UK.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Sites" value={String(totalSites)} sub={`${us.sites.length} US · ${uk.sites.length} UK`} />
        <Kpi
          label="Avg margin (US)"
          value={formatPrice(avgUsMargin, "USD")}
          sub="per gallon"
        />
        <Kpi
          label="Avg margin (UK)"
          value={formatPrice(avgUkMargin, "GBP")}
          sub="per litre"
        />
        <Kpi
          label="Cheaper than rivals"
          value={`${cheaperThanComp}/${totalSites}`}
          sub="regular grade"
        />
      </div>

      <AskBox sites={allSiteRecords} />

      <PriceMap initial={us} />

      <SiteList us={us.sites} uk={uk.sites} />
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-eg-ink-soft">{label}</div>
      <div className="kpi-num mt-1 text-2xl font-bold text-eg-navy">{value}</div>
      {sub && <div className="text-xs text-eg-ink-soft">{sub}</div>}
    </div>
  );
}
