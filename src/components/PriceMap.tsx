"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import { scaleLinear } from "d3-scale";
import { Plus, Minus, Maximize2, ChevronLeft } from "lucide-react";
import type { Country, MapData, SiteMapPoint } from "@/lib/types";
import { GEO_CONFIG, geoRegionKey, regionLabel } from "@/lib/geo";
import { formatPrice, unitLabel } from "@/lib/utils";

interface Props {
  initial: MapData;
  /** When set, the map opens focused on this site. */
  focusSiteId?: string;
  /** When set, the map opens drilled into this region (seed `region` key). */
  focusRegion?: string;
  /** Override the default navigation to the site detail page. */
  onOpenSite?: (siteId: string) => void;
  /** Compact height for embedding. */
  height?: number;
}

interface Hover {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

type GeoFeature = {
  rsmKey: string;
  properties: Record<string, unknown>;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 14;

export function PriceMap({
  initial,
  focusSiteId,
  focusRegion,
  onOpenSite,
  height = 520,
}: Props) {
  const router = useRouter();
  const [country, setCountry] = useState<Country>(initial.country);
  const [data, setData] = useState<MapData>(initial);
  const [loading, setLoading] = useState(false);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const cfg = GEO_CONFIG[country];
  const [view, setView] = useState<{ center: [number, number]; zoom: number }>({
    center: cfg.center,
    zoom: 1,
  });

  const open = useCallback(
    (siteId: string) => {
      if (onOpenSite) onOpenSite(siteId);
      else router.push(`/site/${siteId}`);
    },
    [onOpenSite, router]
  );

  async function switchCountry(next: Country) {
    if (next === country) return;
    setCountry(next);
    setActiveRegion(null);
    setView({ center: GEO_CONFIG[next].center, zoom: 1 });
    setLoading(true);
    try {
      const res = await fetch(`/api/map?country=${next}`, { cache: "no-store" });
      setData((await res.json()) as MapData);
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
      .range(["#cfdaf2", "#5f7fc4", "#0a1f44"]);
    return (region: string) => {
      const vals = data.sites
        .filter((s) => s.site.region === region)
        .map((s) => s.margin)
        .filter((m): m is number => m != null);
      if (!vals.length) return "var(--eg-surface-2)";
      return scale(vals.reduce((a, b) => a + b, 0) / vals.length);
    };
  }, [data.sites, minM, maxM]);

  const regionsWithSites = useMemo(
    () => new Set(data.sites.map((s) => s.site.region)),
    [data.sites]
  );

  const visibleSites = activeRegion
    ? data.sites.filter((s) => s.site.region === activeRegion)
    : data.sites;

  // Focus on a specific site if requested.
  useEffect(() => {
    if (!focusSiteId) return;
    const target = data.sites.find((s) => s.site.siteId === focusSiteId);
    if (target) {
      setActiveRegion(target.site.region);
      setView({ center: [target.site.lon, target.site.lat], zoom: 8 });
    }
  }, [focusSiteId, data.sites]);

  // Drill into a region if requested (centroid = mean of its site coords).
  useEffect(() => {
    if (!focusRegion) return;
    const pts = data.sites.filter((s) => s.site.region === focusRegion);
    if (pts.length) {
      const lon = pts.reduce((a, p) => a + p.site.lon, 0) / pts.length;
      const lat = pts.reduce((a, p) => a + p.site.lat, 0) / pts.length;
      setActiveRegion(focusRegion);
      setView({ center: [lon, lat], zoom: country === "US" ? 5 : 6 });
    }
  }, [focusRegion, data.sites, country]);

  function drillRegion(region: string, geo: GeoFeature) {
    setActiveRegion(region);
    const centroid = geoCentroid(geo as never) as [number, number];
    const valid =
      Array.isArray(centroid) &&
      Number.isFinite(centroid[0]) &&
      Number.isFinite(centroid[1]);
    setView({
      center: valid ? centroid : cfg.center,
      zoom: country === "US" ? 4.5 : 5.5,
    });
  }

  function resetView() {
    setActiveRegion(null);
    setView({ center: cfg.center, zoom: 1 });
  }

  function zoomBy(factor: number) {
    setView((v) => ({
      ...v,
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor)),
    }));
  }

  // ZoomableGroup scales all child SVG by `zoom`, so divide marker geometry by
  // it to keep markers a roughly constant on-screen size at every zoom level.
  // Clamp so they never dominate the whole-country view nor vanish when deep.
  const markerScale = Math.min(1, 1 / view.zoom);

  return (
    <div className="card relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eg-line px-4 py-3">
        <div className="flex items-center gap-2">
          {activeRegion && (
            <button
              onClick={resetView}
              className="inline-flex items-center gap-1 rounded-full border border-eg-line px-2.5 py-1 text-xs text-eg-ink-soft hover:bg-eg-surface-2"
            >
              <ChevronLeft size={13} /> {country}
            </button>
          )}
          <div>
            <h2 className="text-sm font-semibold text-eg-ink">
              {activeRegion
                ? `${regionLabel(country, activeRegion)}`
                : "Network price map"}
            </h2>
            <p className="text-xs text-eg-ink-soft">
              {activeRegion
                ? `${visibleSites.length} EG site(s) · click a marker to open`
                : "Shaded by avg margin · scroll to zoom, drag to pan, click a region to drill"}
            </p>
          </div>
        </div>
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

      <div
        className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}
        style={{ height }}
      >
        <ComposableMap
          projection={cfg.projection}
          projectionConfig={{ scale: cfg.scale, center: cfg.center }}
          width={900}
          height={520}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup
            zoom={view.zoom}
            center={view.center}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            onMoveEnd={(pos: { coordinates: [number, number]; zoom: number }) =>
              setView({ center: pos.coordinates, zoom: pos.zoom })
            }
          >
            <Geographies geography={cfg.url}>
              {({ geographies }: { geographies: GeoFeature[] }) =>
                geographies.map((geo) => {
                  const geoName = (geo.properties.name ?? "") as string;
                  const region = geoRegionKey(country, geoName);
                  const hasSites = regionsWithSites.has(region);
                  const isActive = activeRegion === region;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => hasSites && drillRegion(region, geo)}
                      onMouseEnter={(e: React.MouseEvent) => {
                        if (!hasSites) return;
                        const n = data.sites.filter(
                          (s) => s.site.region === region
                        ).length;
                        setHover({
                          x: e.clientX,
                          y: e.clientY,
                          title: regionLabel(country, region),
                          lines: [`${n} EG site(s)`, "Click to drill in"],
                        });
                      }}
                      onMouseMove={(e: React.MouseEvent) =>
                        setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))
                      }
                      onMouseLeave={() => setHover(null)}
                      style={{
                        default: {
                          fill: hasSites ? regionColor(region) : "var(--eg-surface-2)",
                          stroke: "var(--eg-surface)",
                          strokeWidth: isActive ? 1 : 0.4,
                          outline: "none",
                          cursor: hasSites ? "pointer" : "default",
                          transition: "fill 0.2s",
                        },
                        hover: {
                          fill: hasSites ? "var(--eg-navy-600)" : "var(--eg-surface-2)",
                          stroke: "var(--eg-surface)",
                          outline: "none",
                        },
                        pressed: { fill: "var(--eg-navy-700)", outline: "none" },
                      }}
                    />
                  );
                })
              }
            </Geographies>

            {/* Competitor markers (only when drilled in / zoomed). */}
            {(activeRegion || view.zoom > 3) &&
              data.competitors
                .filter((c) => visibleSites.some((s) => s.site.siteId === c.siteId))
                .map((c) => (
                  <Marker key={`c-${c.id}`} coordinates={[c.lon, c.lat]}>
                    <circle
                      r={1.5 * markerScale}
                      fill="var(--eg-ink-soft)"
                      opacity={0.45}
                    />
                  </Marker>
                ))}

            {/* EG site markers. */}
            {visibleSites.map((s) => (
              <SiteMarker
                key={s.site.siteId}
                point={s}
                country={country}
                scale={markerScale}
                showLabel={view.zoom > 4}
                onOpen={() => open(s.site.siteId)}
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

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
        <ZoomButton onClick={() => zoomBy(1.6)} label="Zoom in">
          <Plus size={16} />
        </ZoomButton>
        <ZoomButton onClick={() => zoomBy(1 / 1.6)} label="Zoom out">
          <Minus size={16} />
        </ZoomButton>
        <ZoomButton onClick={resetView} label="Reset view">
          <Maximize2 size={15} />
        </ZoomButton>
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-eg-line bg-eg-surface-raised/90 px-3 py-2 text-[11px] backdrop-blur">
        <div className="mb-1 font-semibold text-eg-ink">Marker vs rivals</div>
        <LegendRow color="#0f9d58" label="Cheaper" />
        <LegendRow color="#e8a23d" label="In line" />
        <LegendRow color="#e4002b" label="Dearer" />
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-eg-line bg-eg-surface-raised px-3 py-2 text-xs shadow-lg"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
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

function ZoomButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-eg-line bg-eg-surface-raised text-eg-ink shadow-sm transition-colors hover:bg-eg-surface-2"
    >
      {children}
    </button>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-eg-ink-soft">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}

function SiteMarker({
  point,
  country,
  scale,
  showLabel,
  onOpen,
  onHover,
  onLeave,
}: {
  point: SiteMapPoint;
  country: Country;
  scale: number;
  showLabel: boolean;
  onOpen: () => void;
  onHover: (x: number, y: number) => void;
  onLeave: () => void;
}) {
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
  const r = 3 * scale;
  return (
    <Marker coordinates={[point.site.lon, point.site.lat]}>
      <g
        onClick={onOpen}
        onMouseEnter={(e) => onHover(e.clientX, e.clientY)}
        onMouseMove={(e) => onHover(e.clientX, e.clientY)}
        onMouseLeave={onLeave}
        style={{ cursor: "pointer" }}
      >
        <circle r={r} fill={fill} stroke="#fff" strokeWidth={0.8 * scale} />
        {showLabel && (
          <text
            x={r + 1.5 * scale}
            y={1.2 * scale}
            fontSize={6 * scale}
            fill="var(--eg-ink)"
            style={{ pointerEvents: "none", fontWeight: 600 }}
          >
            {point.site.name}
          </text>
        )}
      </g>
    </Marker>
  );
}
