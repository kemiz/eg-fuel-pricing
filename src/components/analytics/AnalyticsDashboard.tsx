"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Droplets,
  Fuel,
  Gauge,
  LayoutDashboard,
  LineChart,
  Map as MapIcon,
  MapPin,
  Minus,
  Scale,
  Siren,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  Analytics,
  CountryAnalytics,
  PerformanceData,
  RegionRollup,
} from "@/lib/data/server";
import type { MapData, Site } from "@/lib/types";
import { PerformanceTab } from "@/components/analytics/PerformanceTab";
import { Card, Pill, SectionHeader, Sparkline } from "@/components/ui";
import { SimRefreshing } from "@/components/SimRefreshing";
import { ChangeFlash } from "@/components/ChangeFlash";
import { PriceMap } from "@/components/PriceMap";
import { RegionTable } from "@/components/RegionTable";
import { AskAssistant } from "@/components/assistant/AskAssistant";
import {
  cn,
  currencySymbol,
  formatCompactMoney,
  formatCompactNumber,
  formatPrice,
} from "@/lib/utils";
import {
  MarginPoolTrend,
  PriceVsCompTrend,
  PositioningDonut,
  RegionMarginPoolChart,
  BrandMarginChart,
  MarginDistribution,
  ElasticityScatter,
} from "@/components/analytics/AnalyticsCharts";

type TabId = "overview" | "performance" | "map" | "events";

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
  hint: string;
}

const TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, hint: "KPIs, trends & breakdowns" },
  { id: "performance", label: "Performance", icon: LineChart, hint: "Cumulative results & price-change impact" },
  { id: "map", label: "Network map", icon: MapIcon, hint: "Geographic margin & positioning" },
  { id: "events", label: "Market events", icon: Siren, hint: "Crude, competitor & demand shocks" },
];

interface AssistantContext {
  title: string;
  description: string;
  suggestions: string[];
}

/**
 * The Ask EG panel is scoped to the tab in view, so its intro and starter
 * prompts line up with whatever the operator is currently looking at.
 */
const ASSISTANT_CONTEXT: Record<TabId, AssistantContext> = {
  overview: {
    title: "Ask about performance",
    description:
      "Dig into the KPIs and trends on this tab — margins, positioning and where to focus.",
    suggestions: [
      "Which regions have the strongest margins right now?",
      "Where are we priced above our local competitors?",
      "Compare US and UK average margins",
      "Which sites should we review first this week?",
    ],
  },
  performance: {
    title: "Ask about results",
    description:
      "Make sense of how the network is performing over the run — cumulative margin, uplift vs baseline, and how your applied price changes landed.",
    suggestions: [
      "How are we performing overall since the simulation started?",
      "Is active pricing beating holding baseline prices flat?",
      "Which applied price changes improved margin, and which didn't?",
      "What should we change to lift the margin pool from here?",
    ],
  },
  map: {
    title: "Ask about the map",
    description:
      "Explore the network geographically — drill into a region or compare areas.",
    suggestions: [
      "Break the network down: cheaper vs in line vs dearer than rivals",
      "Which region has the most sites priced above competitors?",
      "Where are our biggest margin opportunities by region?",
      "Compare margins across US regions",
    ],
  },
  events: {
    title: "Ask about market events",
    description:
      "Make sense of the recent shocks — crude moves, price wars and demand swings.",
    suggestions: [
      "Summarise the market events from the last few days",
      "Which sites were hit by supply outages or demand swings?",
      "How should we respond to the recent price wars?",
      "What's the impact of the latest crude spike on our margins?",
    ],
  },
};

export function AnalyticsDashboard({
  analytics,
  rollups,
  mapData,
  sites,
  performance,
  initialTab,
  focusRegion,
}: {
  analytics: Analytics;
  rollups: RegionRollup[];
  mapData: MapData;
  sites: Site[];
  performance: PerformanceData;
  initialTab?: string;
  focusRegion?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const validInitial = TABS.some((t) => t.id === initialTab)
    ? (initialTab as TabId)
    : "overview";
  const [tab, setTab] = useState<TabId>(validInitial);

  // Keep the active tab in the URL (shareable / back-button friendly) without a
  // full navigation. Drop the region param once we leave the map tab.
  const selectTab = useCallback(
    (next: TabId) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") params.delete("tab");
      else params.set("tab", next);
      if (next !== "map") params.delete("region");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const eventCount = analytics.events.length;

  // Assistant context is scoped to the tab the operator is currently viewing,
  // so its prompts and intro match what's on screen.
  const assistant = ASSISTANT_CONTEXT[tab];

  return (
    <div className="flex h-full flex-col">
      {/* Themed sub-tabs */}
      <div className="shrink-0 border-b border-eg-line">
        <nav className="-mb-px flex flex-wrap items-center gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                title={t.hint}
                className={cn(
                  "relative inline-flex items-center gap-2 px-4 py-2.5 text-sm transition-colors",
                  active
                    ? "font-semibold text-eg-navy"
                    : "text-eg-ink-soft hover:text-eg-ink"
                )}
              >
                <Icon size={15} />
                {t.label}
                {t.id === "events" && eventCount > 0 && (
                  <span className="rounded-full bg-eg-navy/10 px-1.5 py-0.5 text-[10px] font-semibold text-eg-navy">
                    {eventCount}
                  </span>
                )}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-eg-navy" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* On large screens: the active tab scrolls on the left while the Ask EG
          assistant stays pinned on the right (its input always in view). On
          small screens it stacks into normal page flow. */}
      <div className="grid items-start gap-6 pt-6 lg:min-h-0 lg:flex-1 lg:grid-cols-5">
        <div className="eg-scroll lg:col-span-3 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1 lg:pb-4">
          {tab === "overview" && <OverviewTab analytics={analytics} />}
          {tab === "performance" && <PerformanceTab performance={performance} />}
          {tab === "map" && (
            <MapTab rollups={rollups} mapData={mapData} focusRegion={focusRegion} />
          )}
          {tab === "events" && (
            <EventFeed
              events={analytics.events}
              siteIndex={analytics.siteIndex}
              regionLabels={analytics.regionLabels}
              expanded
            />
          )}
        </div>

        {/* Right: Ask EG assistant, scoped to the active tab. */}
        <div className="flex flex-col gap-3 lg:col-span-2 lg:h-full lg:min-h-0">
          <SectionHeader
            eyebrow="Ask EG"
            title={assistant.title}
            description={assistant.description}
          />
          <div className="min-h-0 flex-1">
            <AskAssistant
              key={tab}
              sites={sites}
              fill
              suggestions={assistant.suggestions}
              persistKey={`analytics:${tab}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Overview tab                                                               */
/* -------------------------------------------------------------------------- */

function OverviewTab({ analytics }: { analytics: Analytics }) {
  const [country, setCountry] = useState<"US" | "UK">("US");
  const active =
    analytics.countries.find((c) => c.country === country) ??
    analytics.countries[0];

  return (
    <div className="space-y-6">
      {/* Country switcher */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-xl border border-eg-line bg-eg-surface/60 p-1 backdrop-blur">
          {analytics.countries.map((c) => (
            <button
              key={c.country}
              type="button"
              onClick={() => setCountry(c.country)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                active.country === c.country
                  ? "bg-eg-navy text-white shadow-sm"
                  : "text-eg-ink-soft hover:text-eg-ink"
              )}
            >
              {c.country === "US" ? "United States" : "United Kingdom"}
              <span className="ml-2 text-xs opacity-70">{c.kpis.sites} sites</span>
            </button>
          ))}
        </div>
        <span className="hidden text-xs text-eg-ink-soft sm:inline">
          Regular grade · prices in {active.currency === "USD" ? "$/gal" : "£/L"}
        </span>
      </div>

      <SimRefreshing>
        <KpiRow c={active} />
      </SimRefreshing>

      {/* Trends */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionHeader
            eyebrow="Profitability"
            title="Daily fuel margin pool"
            description="Modelled gross fuel margin per day (per-unit margin × daily volume), summed across the network."
          />
          <SimRefreshing className="mt-4">
            <MarginPoolTrend data={active.trend} currency={active.currency} />
          </SimRefreshing>
        </Card>
        <Card>
          <SectionHeader
            eyebrow="Positioning"
            title="Vs local rivals"
            description="How our pump price sits against nearby competitors."
          />
          <SimRefreshing className="mt-2">
            <PositioningDonut data={active.positioning} total={active.kpis.sites} />
          </SimRefreshing>
        </Card>
      </div>

      <Card>
        <SectionHeader
          eyebrow="Pricing"
          title="EG price vs competitor average & per-unit margin"
          description="Network-average pump price tracked against the local competitor average, with the per-unit margin underneath."
        />
        <SimRefreshing className="mt-4">
          <PriceVsCompTrend data={active.trend} currency={active.currency} unit={active.unit} />
        </SimRefreshing>
      </Card>

      {/* Region + brand breakdowns */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionHeader
            eyebrow="By region"
            title="Margin pool by region"
            description="Where the daily margin is concentrated."
          />
          <SimRefreshing className="mt-4">
            <RegionMarginPoolChart data={active.regions} currency={active.currency} />
          </SimRefreshing>
        </Card>
        <Card>
          <SectionHeader
            eyebrow="By banner"
            title="Per-unit margin by brand"
            description="Average margin across each banner brand, sized by margin pool."
          />
          <SimRefreshing className="mt-4">
            <BrandMarginChart data={active.brands} currency={active.currency} unit={active.unit} />
          </SimRefreshing>
        </Card>
      </div>

      {/* Distribution + elasticity */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionHeader
            eyebrow="Distribution"
            title="Margin spread across sites"
            description="How many forecourts fall into each per-unit margin band."
          />
          <SimRefreshing className="mt-4">
            <MarginDistribution data={active.marginHistogram} />
          </SimRefreshing>
        </Card>
        <Card>
          <SectionHeader
            eyebrow="Opportunity"
            title="Elasticity vs margin"
            description="Price-sensitive sites (left) priced above rivals are the best candidates for a cut; inelastic, cheap sites (right) can hold or lift."
          />
          <SimRefreshing className="mt-4">
            <ElasticityScatter data={active.elasticity} currency={active.currency} unit={active.unit} />
          </SimRefreshing>
        </Card>
      </div>

      {/* Site leaderboards */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SiteTable
          title="Top sites by daily margin"
          eyebrow="Leaders"
          rows={active.topSites}
          currency={active.currency}
          unit={active.unit}
        />
        <SiteTable
          title="Sites needing attention"
          eyebrow="Watchlist"
          rows={active.bottomSites}
          currency={active.currency}
          unit={active.unit}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Network map tab                                                            */
/* -------------------------------------------------------------------------- */

function MapTab({
  rollups,
  mapData,
  focusRegion,
}: {
  rollups: RegionRollup[];
  mapData: MapData;
  focusRegion?: string;
}) {
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-eg-ink-soft">
        Every EG forecourt shaded by per-unit margin. Scroll to zoom, drag to pan,
        click a region to drill into its sites, then a marker to open a site.
      </p>
      <PriceMap initial={mapData} focusRegion={focusRegion} height={620} />
      <RegionTable rollups={rollups} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  KPI row                                                                    */
/* -------------------------------------------------------------------------- */

function KpiRow({ c }: { c: CountryAnalytics }) {
  const unit = c.unit;
  const dp = c.currency === "GBP" ? 3 : 2;
  const symbol = currencySymbol(c.currency);

  // "Avg vs rivals" is the mean signed gap to local competitors. Across the
  // network the gap nets close to zero, so classify it with the same band the
  // rest of the app uses (cheaper / in line / dearer) rather than treating any
  // tiny positive number as "dearer" (red).
  const band = c.currency === "USD" ? 0.05 : 0.02;
  const avgDelta = c.kpis.avgDelta ?? 0;
  const inBand = Math.abs(avgDelta) <= band;
  const vsRivalsTone: "navy" | "green" | "red" = inBand
    ? "navy"
    : avgDelta > 0
      ? "red"
      : "green";
  const vsRivalsValue = inBand
    ? "In line"
    : `${avgDelta > 0 ? "+" : "−"}${symbol}${Math.abs(avgDelta).toFixed(dp)}`;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard
        icon={Banknote}
        label="Daily margin pool"
        value={formatCompactMoney(c.kpis.marginPool, c.currency)}
        suffix="/day"
        delta={c.kpis.marginPoolWowPct}
        deltaSuffix="% WoW"
        spark={c.marginPoolSpark}
        tone="navy"
      />
      <KpiCard
        icon={Scale}
        label="Avg per-unit margin"
        value={`${symbol}${(c.kpis.avgMargin ?? 0).toFixed(dp)}`}
        suffix={unit}
        tone="green"
      />
      <KpiCard
        icon={c.country === "US" ? Fuel : Droplets}
        label="Daily volume"
        value={formatCompactNumber(c.kpis.totalVolume)}
        suffix={c.country === "US" ? " gal" : " L"}
        tone="navy"
      />
      <KpiCard
        icon={Gauge}
        label="Avg vs rivals"
        value={vsRivalsValue}
        suffix={inBand ? undefined : unit}
        tone={vsRivalsTone}
        footer={
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill tone="good">{c.kpis.cheaper} cheaper</Pill>
            <Pill tone="watch">{c.kpis.inLine} in line</Pill>
            <Pill tone="bad">{c.kpis.dearer} dearer</Pill>
          </div>
        }
      />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  suffix,
  delta,
  deltaSuffix,
  spark,
  footer,
  tone = "navy",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  suffix?: string;
  delta?: number | null;
  deltaSuffix?: string;
  spark?: number[];
  footer?: React.ReactNode;
  tone?: "navy" | "green" | "red";
}) {
  const toneText =
    tone === "green" ? "text-eg-green-600" : tone === "red" ? "text-eg-red" : "text-eg-navy";
  const up = delta != null && delta > 0;
  const flat = delta != null && Math.abs(delta) < 0.05;
  const DeltaIcon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="eg-tile flex flex-col p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-eg-ink-soft">
          {label}
        </span>
        <Icon size={15} className={toneText} />
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <ChangeFlash value={value} className={cn("kpi-num text-2xl font-bold", toneText)}>
          {value}
        </ChangeFlash>
        {suffix && <span className="text-xs font-medium text-eg-ink-soft">{suffix}</span>}
      </div>
      {delta != null && (
        <div
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-xs font-medium",
            flat ? "text-eg-ink-soft" : up ? "text-eg-green-600" : "text-eg-red"
          )}
        >
          <DeltaIcon size={13} />
          {up ? "+" : ""}
          {delta.toFixed(1)}
          {deltaSuffix}
        </div>
      )}
      {spark && spark.length > 1 && (
        <div className="mt-auto pt-3">
          <Sparkline values={spark} positive={delta == null ? undefined : delta >= 0} />
        </div>
      )}
      {footer}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Site leaderboard table                                                     */
/* -------------------------------------------------------------------------- */

function SiteTable({
  title,
  eyebrow,
  rows,
  currency,
  unit,
}: {
  title: string;
  eyebrow: string;
  rows: import("@/lib/data/server").SiteRank[];
  currency: string;
  unit: string;
}) {
  const band = currency === "USD" ? 0.05 : 0.02;
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="border-b border-eg-line px-5 py-4">
        <SectionHeader eyebrow={eyebrow} title={title} />
      </div>
      <SimRefreshing>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-eg-ink-soft">
              <th className="px-5 py-2 font-medium">Site</th>
              <th className="px-2 py-2 text-right font-medium">Margin{unit}</th>
              <th className="px-2 py-2 text-right font-medium">Daily pool</th>
              <th className="px-5 py-2 text-right font-medium">vs rivals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tone =
                r.delta < -band ? "good" : r.delta > band ? "bad" : "watch";
              const deltaLabel = `${r.delta >= 0 ? "+" : ""}${formatPrice(r.delta, currency)}`;
              return (
                <tr
                  key={r.siteId}
                  className="border-t border-eg-line transition-colors hover:bg-eg-surface-2/60"
                >
                  <td className="px-5 py-2">
                    <Link
                      href={`/site/${r.siteId}`}
                      className="font-medium text-eg-ink hover:text-eg-navy"
                    >
                      {r.name}
                    </Link>
                    <div className="text-[11px] text-eg-ink-soft">
                      {r.brand} · {r.regionLabel}
                    </div>
                  </td>
                  <td className="kpi-num px-2 py-2 text-right font-semibold text-eg-navy">
                    <ChangeFlash
                      value={formatPrice(r.margin, currency)}
                      numeric={r.margin}
                      className="inline-block px-1"
                    >
                      {formatPrice(r.margin, currency)}
                    </ChangeFlash>
                  </td>
                  <td className="kpi-num px-2 py-2 text-right text-eg-ink-soft">
                    {formatCompactMoney(r.marginPool, currency)}
                  </td>
                  <td className="px-5 py-2 text-right">
                    <Pill tone={tone}>{deltaLabel}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SimRefreshing>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Market event feed                                                          */
/* -------------------------------------------------------------------------- */

function EventFeed({
  events,
  siteIndex = {},
  regionLabels = {},
  expanded = false,
}: {
  events: Analytics["events"];
  siteIndex?: Analytics["siteIndex"];
  regionLabels?: Analytics["regionLabels"];
  expanded?: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "good" | "bad">("all");
  const shown = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.tone === filter)),
    [events, filter]
  );

  const kindLabel: Record<string, string> = {
    crude_spike: "Crude spike",
    price_war: "Price war",
    outage: "Supply outage",
    demand_swing: "Demand swing",
  };

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-eg-line px-5 py-4">
        <SectionHeader
          eyebrow="Market"
          title="Event log"
          description="Crude, competitor and demand shocks fired by the simulated market — newest first."
        />
        <div className="flex items-center gap-1 rounded-lg border border-eg-line p-0.5">
          {(["all", "good", "bad"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                filter === f
                  ? "bg-eg-navy text-white"
                  : "text-eg-ink-soft hover:text-eg-ink"
              )}
            >
              {f === "good" ? "Positive" : f === "bad" ? "Adverse" : "All"}
            </button>
          ))}
        </div>
      </div>
      <SimRefreshing>
        {shown.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-eg-ink-soft">
            No market events yet — press play on the simulation to advance days.
          </div>
        ) : (
          <ul
            className={cn(
              "divide-y divide-eg-line",
              // When expanded the parent column owns the scroll; otherwise cap.
              expanded ? "" : "max-h-96 overflow-y-auto eg-scroll"
            )}
          >
            {shown.map((e) => {
              const toneClass =
                e.tone === "good"
                  ? "text-eg-green-600"
                  : e.tone === "bad"
                    ? "text-eg-red"
                    : "text-eg-navy";
              const ToneIcon =
                e.tone === "good" ? TrendingUp : e.tone === "bad" ? Activity : Activity;
              const site = e.scope === "site" && e.ref ? siteIndex[e.ref] : undefined;
              return (
                <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                  <ToneIcon size={16} className={cn("mt-0.5 shrink-0", toneClass)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-eg-ink">{e.headline}</span>
                      <Pill tone={e.scope === "network" ? "info" : "neutral"}>
                        {kindLabel[e.kind] ?? e.kind}
                      </Pill>
                      <EventTarget
                        scope={e.scope}
                        site={site}
                        regionLabel={
                          e.scope === "region" && e.ref
                            ? regionLabels[e.ref] ?? e.ref
                            : undefined
                        }
                      />
                    </div>
                    {e.detail && (
                      <p className="mt-0.5 text-xs text-eg-ink-soft">{e.detail}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-eg-ink-soft">
                    <div>Day {e.dayIndex}</div>
                    <div>{e.day.slice(5)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SimRefreshing>
    </Card>
  );
}

/** Renders which site / region an event affected — a link for site-scoped. */
function EventTarget({
  scope,
  site,
  regionLabel,
}: {
  scope: "network" | "region" | "site";
  site?: import("@/lib/data/server").SiteRef;
  regionLabel?: string;
}) {
  if (scope === "network") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-eg-ink-soft">
        <MapPin size={11} /> Network-wide
      </span>
    );
  }
  if (scope === "site" && site) {
    return (
      <Link
        href={`/site/${site.siteId}`}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-eg-navy hover:underline"
      >
        <MapPin size={11} />
        {site.name}
        <span className="font-normal text-eg-ink-soft">
          · {site.brand} · {site.regionLabel}
        </span>
      </Link>
    );
  }
  if (scope === "region" && regionLabel) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-eg-ink">
        <MapPin size={11} className="text-eg-ink-soft" />
        {regionLabel}
      </span>
    );
  }
  return null;
}
