// Client-side model for the IDOT crash dataset written by scripts/fetch-idot-crashes.mjs.
// Aggregations mirror the Chicago Crash Dashboard API (github.com/MisterClean/chicago-crashes-pipeline),
// limited to what IDOT's public crash records contain.

export const CRASH_DATA_URL = "/data/crashes/champaign-urbana-savoy-idot.json";
export const CRASH_PLACES_URL = "/data/crashes/places.geojson";

export type Severity = "K" | "A" | "B" | "C" | "O";

export interface CrashDataset {
  meta: {
    source: string;
    sourceUrl: string;
    county: string;
    cities: string[];
    years: number[];
    perYear: Record<string, number>;
    /** Heavy-vehicle and University District fields matched from CCRPC's crash dashboard. */
    ccrpc?: {
      source: string;
      years: number[];
      ccrpcCrashes: number;
      matched: number;
      heavyVehicle: number;
      universityDistrict: number;
    } | null;
  };
  dict: Record<"type" | "cause" | "city" | "street" | "light" | "weather" | "surface", string[]>;
  cols: Record<
    | "id" | "date" | "hour" | "lon" | "lat" | "k" | "a" | "b" | "c" | "injured" | "vehicles"
    | "type" | "cause" | "city" | "street" | "cross" | "hitRun" | "light" | "weather" | "surface",
    number[]
  > &
    // 1 = yes, 0 = no, -1 = not covered by CCRPC
    Partial<Record<"heavy" | "university", number[]>>;
}

export interface Crash {
  id: number;
  /** ISO date, YYYY-MM-DD */
  date: string;
  hour: number;
  lon: number | null;
  lat: number | null;
  fatalities: number;
  aInjuries: number;
  bInjuries: number;
  cInjuries: number;
  injuries: number;
  vehicles: number;
  severity: Severity;
  crashType: string;
  cause: string;
  city: string;
  street: string;
  crossStreet: string;
  hitAndRun: boolean;
  lighting: string;
  weather: string;
  surface: string;
  /** From CCRPC; null where CCRPC doesn't cover the crash (before 2020, after its latest year, or unmatched). */
  heavyVehicle: boolean | null;
  universityDistrict: boolean | null;
}

export interface Crashes {
  meta: CrashDataset["meta"];
  crashes: Crash[];
  minDate: string;
  maxDate: string;
}

function isoDate(yyyymmdd: number): string {
  const year = Math.floor(yyyymmdd / 10000);
  const month = Math.floor((yyyymmdd % 10000) / 100);
  const day = yyyymmdd % 100;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function severityOf(k: number, a: number, b: number, c: number): Severity {
  if (k > 0) return "K";
  if (a > 0) return "A";
  if (b > 0) return "B";
  if (c > 0) return "C";
  return "O";
}

const ccrpcFlag = (value: number | undefined): boolean | null =>
  value === 1 ? true : value === 0 ? false : null;

export function decodeCrashes(dataset: CrashDataset): Crashes {
  const { cols, dict } = dataset;
  const crashes: Crash[] = cols.id.map((id, i) => {
    const k = cols.k[i];
    const a = cols.a[i];
    const b = cols.b[i];
    const c = cols.c[i];
    return {
      id,
      date: isoDate(cols.date[i]),
      hour: cols.hour[i],
      lon: cols.lon[i] ? cols.lon[i] / 1e5 : null,
      lat: cols.lat[i] ? cols.lat[i] / 1e5 : null,
      fatalities: k,
      aInjuries: a,
      bInjuries: b,
      cInjuries: c,
      injuries: cols.injured[i],
      vehicles: cols.vehicles[i],
      severity: severityOf(k, a, b, c),
      crashType: dict.type[cols.type[i]],
      cause: dict.cause[cols.cause[i]],
      city: dict.city[cols.city[i]],
      street: dict.street[cols.street[i]],
      crossStreet: dict.street[cols.cross[i]],
      hitAndRun: cols.hitRun[i] === 1,
      lighting: dict.light[cols.light[i]],
      weather: dict.weather[cols.weather[i]],
      surface: dict.surface[cols.surface[i]],
      heavyVehicle: ccrpcFlag(cols.heavy?.[i]),
      universityDistrict: ccrpcFlag(cols.university?.[i]),
    };
  });

  return {
    meta: dataset.meta,
    crashes,
    minDate: crashes[0]?.date ?? "",
    maxDate: crashes.at(-1)?.date ?? "",
  };
}

let crashesPromise: Promise<Crashes> | null = null;

export function loadCrashes(): Promise<Crashes> {
  if (!crashesPromise) {
    crashesPromise = fetch(CRASH_DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load crash data (${res.status})`);
        return res.json() as Promise<CrashDataset>;
      })
      .then(decodeCrashes)
      .catch((error) => {
        crashesPromise = null;
        throw error;
      });
  }
  return crashesPromise;
}

export async function loadPlaceBoundaries(): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const res = await fetch(CRASH_PLACES_URL);
    if (!res.ok) return null;
    return (await res.json()) as GeoJSON.FeatureCollection;
  } catch {
    return null;
  }
}

// ─── Filtering ──────────────────────────────────────────────────────────────

export interface DateRange {
  start: string;
  end: string;
}

export function inDateRange(crash: Crash, range: DateRange): boolean {
  return (!range.start || crash.date >= range.start) && (!range.end || crash.date <= range.end);
}

export function isPedestrian(crash: Crash): boolean {
  return crash.crashType === "Pedestrian";
}

export function isBicycle(crash: Crash): boolean {
  return crash.crashType === "Pedalcyclist";
}

// Place filters: all three cities, one city, or CCRPC's University District.
export const ALL_PLACES = "all";
export const UNIVERSITY_DISTRICT = "university";

export function placeLabel(place: string): string {
  if (place === ALL_PLACES) return "Champaign, Urbana & Savoy";
  if (place === UNIVERSITY_DISTRICT) return "University District";
  return place;
}

export function matchesPlace(crash: Crash, place: string): boolean {
  if (place === ALL_PLACES) return true;
  if (place === UNIVERSITY_DISTRICT) return crash.universityDistrict === true;
  return crash.city === place;
}

/** CCRPC's years as an ISO date range, or null when the dataset has no CCRPC fields. */
export function ccrpcRange(data: Crashes): DateRange | null {
  const years = data.meta.ccrpc?.years;
  if (!years?.length) return null;
  return { start: `${years[0]}-01-01`, end: `${years.at(-1)}-12-31` };
}

export interface DatePreset {
  id: string;
  label: string;
  range: DateRange;
}

/** IDOT publishes a full calendar year at a time, so presets are whole years ending at the latest year. */
export function datePresets(minDate: string, maxDate: string): DatePreset[] {
  const latestYear = Number(maxDate.slice(0, 4));
  const yearsBack = (n: number) => ({ start: `${latestYear - n + 1}-01-01`, end: maxDate });
  return [
    { id: "latest", label: String(latestYear), range: yearsBack(1) },
    { id: "3yr", label: "3 yrs", range: yearsBack(3) },
    { id: "5yr", label: "5 yrs", range: yearsBack(5) },
    { id: "all", label: "All", range: { start: minDate, end: maxDate } },
  ];
}

/** For the University District (CCRPC years only), trims a date range to the years CCRPC covers. */
export function rangeForPlace(data: Crashes, place: string, range: DateRange): DateRange {
  const covered = ccrpcRange(data);
  if (place !== UNIVERSITY_DISTRICT || !covered) return range;
  const start = range.start > covered.start ? range.start : covered.start;
  const end = range.end < covered.end ? range.end : covered.end;
  return start <= end ? { start, end } : range;
}

/** Caption for CCRPC-only figures: null without CCRPC data, "" when the range is inside CCRPC's years. */
export function ccrpcNote(data: Crashes, range: DateRange, known: number): string | null {
  const covered = ccrpcRange(data);
  if (!covered) return null;
  if (range.start >= covered.start && range.end <= covered.end) return "";
  const span = `${covered.start.slice(0, 4)}–${covered.end.slice(2, 4)}`;
  return known ? `${span} only` : `Data for ${span} only`;
}

// ─── Aggregations ───────────────────────────────────────────────────────────

export interface CrashStats {
  totalCrashes: number;
  totalInjuries: number;
  totalFatalities: number;
  pedestrianCrashes: number;
  bicycleCrashes: number;
  hitAndRunCount: number;
  heavyVehicleCrashes: number;
  /** Crashes whose heavy-vehicle status is known (CCRPC covers them). */
  heavyVehicleKnown: number;
}

export function summarize(crashes: Crash[]): CrashStats {
  const stats: CrashStats = {
    totalCrashes: crashes.length,
    totalInjuries: 0,
    totalFatalities: 0,
    pedestrianCrashes: 0,
    bicycleCrashes: 0,
    hitAndRunCount: 0,
    heavyVehicleCrashes: 0,
    heavyVehicleKnown: 0,
  };
  for (const crash of crashes) {
    stats.totalInjuries += crash.injuries;
    stats.totalFatalities += crash.fatalities;
    if (isPedestrian(crash)) stats.pedestrianCrashes += 1;
    if (isBicycle(crash)) stats.bicycleCrashes += 1;
    if (crash.hitAndRun) stats.hitAndRunCount += 1;
    if (crash.heavyVehicle !== null) stats.heavyVehicleKnown += 1;
    if (crash.heavyVehicle) stats.heavyVehicleCrashes += 1;
  }
  return stats;
}

export interface TrendPoint {
  period: string;
  crashes: number;
  injuries: number;
  fatalities: number;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekStart(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7)); // Monday
}

/** Weekly (or monthly) totals with zero-filled gaps so quiet weeks still show up in the chart. */
export function trends(crashes: Crash[], range: DateRange, interval: "week" | "month"): TrendPoint[] {
  if (!range.start || !range.end) return [];
  const keyOf = interval === "week" ? weekStart : (iso: string) => iso.slice(0, 7);
  const buckets = new Map<string, TrendPoint>();

  let cursor = interval === "week" ? weekStart(range.start) : `${range.start.slice(0, 7)}-01`;
  while (cursor <= range.end) {
    const key = keyOf(cursor);
    buckets.set(key, { period: key, crashes: 0, injuries: 0, fatalities: 0 });
    if (interval === "week") {
      cursor = addDays(cursor, 7);
    } else {
      const date = new Date(`${cursor}T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + 1);
      cursor = date.toISOString().slice(0, 10);
    }
  }

  for (const crash of crashes) {
    const bucket = buckets.get(keyOf(crash.date));
    if (!bucket) continue;
    bucket.crashes += 1;
    bucket.injuries += crash.injuries;
    bucket.fatalities += crash.fatalities;
  }
  return [...buckets.values()];
}

export interface CauseSummary {
  cause: string;
  crashes: number;
  injuries: number;
  fatalities: number;
  percentage: number;
}

export function causes(crashes: Crash[], limit = 15): CauseSummary[] {
  const byCause = new Map<string, CauseSummary>();
  for (const crash of crashes) {
    const cause = crash.cause || "Unknown";
    const entry = byCause.get(cause) ?? { cause, crashes: 0, injuries: 0, fatalities: 0, percentage: 0 };
    entry.crashes += 1;
    entry.injuries += crash.injuries;
    entry.fatalities += crash.fatalities;
    byCause.set(cause, entry);
  }
  const total = crashes.length || 1;
  return [...byCause.values()]
    .map((entry) => ({ ...entry, percentage: Math.round((entry.crashes / total) * 1000) / 10 }))
    .sort((a, b) => b.crashes - a.crashes)
    .slice(0, limit);
}

// ─── FHWA crash costs ───────────────────────────────────────────────────────
// Per-person KABCO unit costs and per-vehicle costs (2024$), as used by the Chicago dashboard.
// Source: https://highways.dot.gov/sites/fhwa.dot.gov/files/2025-10/CrashCostFactSheet_508_OCT2025.pdf

export const KABCO_COSTS: Record<Exclude<Severity, "O">, { label: string; economic: number; qaly: number }> = {
  K: { label: "Fatal (K)", economic: 1_606_644, qaly: 9_651_851 },
  A: { label: "Incapacitating (A)", economic: 172_179, qaly: 917_345 },
  B: { label: "Non-incapacitating (B)", economic: 44_490, qaly: 180_107 },
  C: { label: "Possible Injury (C)", economic: 25_933, qaly: 85_348 },
};

export const VEHICLE_COST = { economic: 6_269, qaly: 3_927 };

export interface CostLine {
  label: string;
  count: number;
  unitEconomic: number;
  unitQaly: number;
  subtotalEconomic: number;
  subtotalSocietal: number;
}

export interface CostBreakdown {
  injuryCosts: CostLine[];
  vehicleCosts: CostLine;
  totalEconomic: number;
  totalSocietal: number;
}

function costLine(label: string, count: number, unitEconomic: number, unitQaly: number): CostLine {
  return {
    label,
    count,
    unitEconomic,
    unitQaly,
    subtotalEconomic: count * unitEconomic,
    subtotalSocietal: count * (unitEconomic + unitQaly),
  };
}

export function costBreakdown(crashes: Crash[]): CostBreakdown {
  const people = { K: 0, A: 0, B: 0, C: 0 };
  let vehicles = 0;
  for (const crash of crashes) {
    people.K += crash.fatalities;
    people.A += crash.aInjuries;
    people.B += crash.bInjuries;
    people.C += crash.cInjuries;
    // Vehicle costs stand in for the uninjured (O) only in property-damage-only crashes,
    // so injury crashes aren't counted twice.
    if (crash.severity === "O") vehicles += crash.vehicles;
  }
  const injuryCosts = (Object.keys(KABCO_COSTS) as (keyof typeof KABCO_COSTS)[]).map((key) =>
    costLine(KABCO_COSTS[key].label, people[key], KABCO_COSTS[key].economic, KABCO_COSTS[key].qaly),
  );
  const vehicleCosts = costLine("PDO Vehicles", vehicles, VEHICLE_COST.economic, VEHICLE_COST.qaly);
  const lines = [...injuryCosts, vehicleCosts];
  return {
    injuryCosts,
    vehicleCosts,
    totalEconomic: lines.reduce((sum, line) => sum + line.subtotalEconomic, 0),
    totalSocietal: lines.reduce((sum, line) => sum + line.subtotalSocietal, 0),
  };
}

export interface LocationReport {
  stats: CrashStats & {
    incapacitatingInjuries: number;
    crashesWithInjuries: number;
    crashesWithFatalities: number;
    totalVehicles: number;
  };
  costs: CostBreakdown;
  causes: CauseSummary[];
  monthlyTrends: TrendPoint[];
  crashes: Crash[];
}

export function locationReport(crashes: Crash[], range: DateRange): LocationReport {
  let incapacitatingInjuries = 0;
  let crashesWithInjuries = 0;
  let crashesWithFatalities = 0;
  let totalVehicles = 0;
  for (const crash of crashes) {
    incapacitatingInjuries += crash.aInjuries;
    if (crash.injuries > 0) crashesWithInjuries += 1;
    if (crash.fatalities > 0) crashesWithFatalities += 1;
    totalVehicles += crash.vehicles;
  }
  return {
    stats: { ...summarize(crashes), incapacitatingInjuries, crashesWithInjuries, crashesWithFatalities, totalVehicles },
    costs: costBreakdown(crashes),
    causes: causes(crashes),
    monthlyTrends: trends(crashes, range, "month"),
    crashes,
  };
}

// ─── Map + export helpers ───────────────────────────────────────────────────

export function toGeoJSON(crashes: Crash[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  crashes.forEach((crash, index) => {
    if (crash.lon === null || crash.lat === null) return;
    features.push({
      type: "Feature",
      id: index,
      geometry: { type: "Point", coordinates: [crash.lon, crash.lat] },
      properties: {
        index,
        severity: crash.severity,
        hit_and_run: crash.hitAndRun,
        crash_type: crash.crashType,
        heavy: crash.heavyVehicle === null ? -1 : crash.heavyVehicle ? 1 : 0,
      },
    });
  });
  return { type: "FeatureCollection", features };
}

const CSV_COLUMNS: [string, (crash: Crash) => string | number | boolean | null][] = [
  ["crash_id", (c) => c.id],
  ["date", (c) => c.date],
  ["hour", (c) => c.hour],
  ["latitude", (c) => c.lat],
  ["longitude", (c) => c.lon],
  ["municipality", (c) => c.city],
  ["street", (c) => c.street],
  ["at_intersection_with", (c) => c.crossStreet],
  ["severity_kabco", (c) => c.severity],
  ["fatalities", (c) => c.fatalities],
  ["a_injuries", (c) => c.aInjuries],
  ["b_injuries", (c) => c.bInjuries],
  ["c_injuries", (c) => c.cInjuries],
  ["total_injured", (c) => c.injuries],
  ["vehicles", (c) => c.vehicles],
  ["type_of_first_crash", (c) => c.crashType],
  ["primary_cause", (c) => c.cause],
  ["hit_and_run", (c) => c.hitAndRun],
  ["lighting", (c) => c.lighting],
  ["weather", (c) => c.weather],
  ["road_surface", (c) => c.surface],
  ["heavy_vehicle_ccrpc", (c) => c.heavyVehicle],
  ["university_district_ccrpc", (c) => c.universityDistrict],
];

export function toCsv(crashes: Crash[]): string {
  const escape = (value: string | number | boolean | null) => {
    const text = value === null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const header = CSV_COLUMNS.map(([name]) => name).join(",");
  const rows = crashes.map((crash) => CSV_COLUMNS.map(([, get]) => escape(get(crash))).join(","));
  return [header, ...rows].join("\n");
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateRange(range: DateRange): string {
  if (!range.start && !range.end) return "All years";
  return `${formatDate(range.start)} – ${formatDate(range.end)}`;
}
