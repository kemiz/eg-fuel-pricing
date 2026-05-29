"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import type { Country, MapData, SiteMapPoint } from "@/lib/types";
import { GEO_CONFIG, geoRegionKey, regionLabel } from "@/lib/geo";
import { formatPrice, unitLabel } from "@/lib/utils";

interface Props {
  initial: MapData;
}

interface Hover {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

export function PriceMap({ initial }: Props) {
  const router = useRouter();
  const [country, setCountry] = useState<Country>(initial.country);
  const [data, setData] = useState<MapData>(initial);
  const [loading, setLoading] = useState(false);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const cfg = GEO_CONFIG[country];

  async function switchCountry(next: Country) {
    if (next === country) return;
    setCountry(next);
    setActiveRegion(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/map?country=${next}`, { cache: "no-store" });
      const json = (await res.json()) as MapData;
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  // Margin colour scale across the visible sites.
  const margins = data.sites
    .map((s) => s.margin)
    .filter((m): m is number => m != null);
  const minM = margins.length ? Math.min(...margins) : 0;
  const maxM = margins.length ? Math.max(...margins) : 1;
  const regionColor = useMemo(() => {
    const scale = scaleLinear<string>()
      .domain([minM, (minM + maxM) / 2, maxM])
      .range(["#c9d4ee", "#5f7fc4", "#0a1f44"]);
    return (region: string) => {
      const inRegion = data.sites.filter((s) => s.site.region === region);
      const vals = inRegion.map((s) => s.margin).filter((m): m is number => m != null);
      if (!vals.length) return "var(--eg-surface-2)";
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return scale(avg);
    };
  }, [data.sites, minM, maxM]);

  const regionsWithSites = useMemo(
    () => new Set(data.sites.map((s) => s.site.region)),
    [data.sites]
  );

  const visibleSites = activeRegion
    ? data.sites.filter((s) => s.site.region === activeRegion)
    : data.sites;

  return (
    <div className="card relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eg-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-eg-ink">Network price map</h2>
          <p className="text-xs text-eg-ink-soft">
            {activeRegion
              ? `${regionLabel(country, activeRegion)} — ${visibleSites.length} site(s). Click a marker to open.`
              : "Shaded by average per-unit margin. Click a region to drill in."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeRegion && (
            <button
              onClick={() => setActiveRegion(null)}
              className="rounded-full border border-eg-line px-3 py-1 text-xs text-eg-ink-soft hover:bg-eg-surface-2"
            >
              Back to {country}
            </button>
          )}
          <div className="inline-flex overflow-hidden rounded-full border border-eg-line text-xs">
            {(["US", "UK"] as Country[]).map((c) => (
              <button
                key={c}
                onClick={() => switchCountry(c)}
                className={
                  c === country
                    ? "bg-eg-navy px-3 py-1 font-medium text-white"
                    : "px-3 py-1 text-eg-ink-soft hover:bg-eg-surface-2"
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
        <ComposableMap
          projection={cfg.projection}
          projectionConfig={{ scale: cfg.scale, center: cfg.center }}
          width={900}
          height={500}
          style={{ width: "100%", height: "auto" }}
        >
          <ZoomableGroup zoom={1} center={cfg.center}>
            <Geographies geography={cfg.url}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const geoName = (geo.properties.name ?? "") as string;
                  const region = geoRegionKey(country, geoName);
                  const hasSites = regionsWithSites.has(region);
                  const isActive = activeRegion === region;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => hasSites && setActiveRegion(region)}
                      onMouseEnter={(e) => {
                        if (!hasSites) return;
                        setHover({
                          x: e.clientX,
                          y: e.clientY,
                          title: regionLabel(country, region),
                          lines: [
                            `${data.sites.filter((s) => s.site.region === region).length} EG site(s)`,
                            "Click to drill in",
                          ],
                        });
                      }}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        default: {
                          fill: hasSites ? regionColor(region) : "var(--eg-surface-2)",
                          stroke: "var(--eg-line)",
                          strokeWidth: isActive ? 1.5 : 0.5,
                          outline: "none",
                          cursor: hasSites ? "pointer" : "default",
                        },
                        hover: {
                          fill: hasSites ? "var(--eg-navy-600)" : "var(--eg-surface-2)",
                          stroke: "var(--eg-line)",
                          outline: "none",
                        },
                        pressed: { fill: "var(--eg-navy-700)", outline: "none" },
                      }}
                    />
                  );
                })
              }
            </Geographies>

            {/* Competitor markers (lighter) — only when drilled in. */}
            {activeRegion &&
              data.competitors
                .filter((c) =>
                  visibleSites.some((s) => s.site.siteId === c.siteId)
                )
                .map((c) => (
                  <Marker key={`c-${c.id}`} coordinates={[c.lon, c.lat]}>
                    <circle r={3} fill="var(--eg-ink-soft)" opacity={0.5} />
                  </Marker>
                ))}

            {/* EG site markers. */}
            {visibleSites.map((s) => (
              <SiteMarker
                key={s.site.siteId}
                point={s}
                country={country}
                onOpen={() => router.push(`/site/${s.site.siteId}`)}
                onHover={(x, y) =>
                  setHover({
                    x,
                    y,
                    title: `${s.site.name} (${s.site.brand})`,
                    lines: [
                      `Price ${formatPrice(s.price, s.site.currency)}${unitLabel(country)}`,
                      `Competitor avg ${formatPrice(s.competitorAvg, s.site.currency)}`,
                      `Margin ${formatPrice(s.margin, s.site.currency)}${unitLabel(country)}`,
                    ],
                  })
                }
                onLeave={() => setHover(null)}
              />
            ))}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-eg-line bg-eg-surface-raised px-3 py-2 text-xs shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-semibold text-eg-ink">{hover.title}</div>
          {hover.lines.map((l, i) => (
            <div key={i} className="text-eg-ink-soft">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SiteMarker({
  point,
  country,
  onOpen,
  onHover,
  onLeave,
}: {
  point: SiteMapPoint;
  country: Country;
  onOpen: () => void;
  onHover: (x: number, y: number) => void;
  onLeave: () => void;
}) {
  // Colour the marker by delta vs competitors: cheaper = green, dearer = red.
  const delta = point.delta;
  const band = country === "US" ? 0.05 : 0.02;
  const fill =
    delta == null
      ? "var(--eg-navy)"
      : delta < -band
        ? "#0f9d58"
        : delta > band
          ? "#e4002b"
          : "#e8a23d";
  return (
    <Marker coordinates={[point.site.lon, point.site.lat]}>
      <g
        onClick={onOpen}
        onMouseEnter={(e) => onHover(e.clientX, e.clientY)}
        onMouseLeave={onLeave}
        style={{ cursor: "pointer" }}
      >
        <circle r={6} fill={fill} stroke="#fff" strokeWidth={1.5} />
      </g>
    </Marker>
  );
}
