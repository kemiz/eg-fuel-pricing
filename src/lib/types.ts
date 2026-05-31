export type Country = "US" | "UK";
export type GradeId = "regular" | "premium" | "diesel";

export interface Site {
  siteId: string;
  name: string;
  brand: string;
  country: Country;
  region: string;
  currency: string;
  unit: string;
  lat: number;
  lon: number;
}

export interface FuelGrade {
  gradeId: GradeId;
  label: string;
  sortOrder: number;
}

export interface Cost {
  siteId: string;
  gradeId: GradeId;
  wholesaleCost: number;
  deliveryCost: number;
  asOf: string;
}

export interface CompetitorPrice {
  id: number;
  siteId: string;
  competitorName: string;
  gradeId: GradeId;
  price: number;
  lat: number;
  lon: number;
}

export interface DemandSignal {
  siteId: string;
  gradeId: GradeId;
  avgDailyVolume: number;
  elasticity: number;
  trend: "up" | "flat" | "down";
}

export interface PriceRecommendation {
  id: number;
  siteId: string;
  gradeId: GradeId;
  recommendedPrice: number;
  rationale: string;
  projectedMargin: number | null;
  projectedVolume: number | null;
  confidence: number | null;
  perAgentNotes: AgentNote[] | null;
  createdAt: string;
  /**
   * The simulated day index this recommendation was generated on. Lets the UI
   * show its age in SIM days (matching the moving clock) rather than real
   * wall-clock time. Null for older rows created before this was tracked.
   */
  simDayIndex: number | null;
}

export interface AgentNote {
  agent: string;
  note: string;
}

/** Full snapshot for a single site, used by the site page and agent tools. */
export interface SiteSnapshot {
  site: Site;
  grades: FuelGrade[];
  costs: Cost[];
  competitors: CompetitorPrice[];
  demand: DemandSignal[];
  latestRecommendations: PriceRecommendation[];
  /**
   * Current EG pump price per grade, sourced from the latest `price_history` EG
   * row (the live/simulated price). Undefined for a grade with no EG history.
   */
  egPrices: Partial<Record<GradeId, number>>;
}

/** Per-site row for the map / dashboard, with derived price + delta vs comp. */
export interface SiteMapPoint {
  site: Site;
  /** Latest recommended (or modelled) regular-grade price for shading. */
  price: number | null;
  /** Average nearby competitor regular price. */
  competitorAvg: number | null;
  /** price - competitorAvg (negative = cheaper than competitors). */
  delta: number | null;
  /** Modelled per-unit margin on regular grade. */
  margin: number | null;
  /** Per-unit cost (wholesale + delivery) on regular grade. */
  unitCost: number | null;
  /** Average daily volume on regular grade (units/day). */
  volume: number | null;
  /** Price elasticity of demand on regular grade (negative). */
  elasticity: number | null;
}

export interface MapData {
  country: Country;
  sites: SiteMapPoint[];
  competitors: CompetitorPrice[];
}

/** One daily price series (EG or a competitor) for the history chart. */
export interface PriceSeries {
  /** "EG" for our own price, otherwise the competitor name. */
  series: string;
  isEg: boolean;
  points: { day: string; price: number }[];
}

export interface PriceHistory {
  siteId: string;
  gradeId: GradeId;
  currency: string;
  unit: string;
  /** ISO date strings, oldest -> newest. */
  days: string[];
  series: PriceSeries[];
}
