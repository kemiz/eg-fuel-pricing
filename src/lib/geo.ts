import type { Country } from "@/lib/types";

/** US state code -> full name (as used in us-atlas `properties.name`). */
export const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const US_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATE_NAMES).map(([code, name]) => [name, code])
);

/**
 * Normalise a topojson region name to the `region` value used in the seed
 * data so map regions can be matched to sites.
 *   US: full state name -> 2-letter code (e.g. "Massachusetts" -> "MA")
 *   UK: "Yorkshire and The Humber" -> "Yorkshire"; otherwise the name as-is.
 */
export function geoRegionKey(country: Country, geoName: string): string {
  if (country === "US") return US_NAME_TO_CODE[geoName] ?? geoName;
  if (geoName === "Yorkshire and The Humber") return "Yorkshire";
  if (geoName === "Eastern") return "East";
  return geoName;
}

/** Human-friendly region label for a seed `region` value. */
export function regionLabel(country: Country, region: string): string {
  if (country === "US") return US_STATE_NAMES[region] ?? region;
  return region;
}

export interface GeoConfig {
  url: string;
  objectKey: string;
  projection: "geoAlbersUsa" | "geoMercator";
  /** Default whole-country view. */
  center: [number, number];
  scale: number;
}

export const GEO_CONFIG: Record<Country, GeoConfig> = {
  US: {
    url: "/geo/us-states-10m.json",
    objectKey: "states",
    projection: "geoAlbersUsa",
    center: [-97, 38],
    scale: 900,
  },
  UK: {
    url: "/geo/uk-regions.json",
    objectKey: "uk-eer",
    projection: "geoMercator",
    center: [-2.5, 54.5],
    scale: 1800,
  },
};
