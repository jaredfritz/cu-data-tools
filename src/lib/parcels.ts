// Loads and summarizes the countywide parcel dataset built by scripts/fetch-parcel-values.mjs.
// Methodology adapted from Strong Towns Chicago's value-per-acre map (MIT); see
// src/components/parcels/LICENSE-chicago-value-per-acre.txt.

import { VACANT_CLASS_TYPES, vacantTypeFor, type VacantType } from "./vacant";

export const PARCEL_DATA_URL = "/data/parcels/champaign-county-parcels.json";

// Illinois counties outside Cook assess property at one-third of market value, so market value
// is three times the equalized assessed value (EAV).
export const ASSESSMENT_RATIO = 1 / 3;
const SQ_FT_PER_ACRE = 43560;

interface ParcelDataset {
  meta: ParcelMeta;
  dict: {
    useCode: string[];
    city: string[];
    taxCode: string[];
    taxRate: (number | null)[];
    tif: (string | null)[];
  };
  cols: {
    pin: string[];
    address: string[];
    /** Other units' addresses for multi-unit parcels, joined with "|" */
    otherAddresses?: string[];
    units: number[];
    /** 1 when the parcel is a reconstructed condo/townhome development (approximate area) */
    condoDev: number[];
    /** 1 when a vacant parcel is held with the built parcel next door (same taxpayer) */
    held?: number[];
    useCode: number[];
    city: number[];
    taxCode: number[];
    exempt: number[];
    eav: (number | null)[];
    land: number[];
    building: number[];
    area: number[];
    geom: number[][][][];
  };
}

export interface ParcelMeta {
  parcelSource: string;
  parcelSourceUrl: string;
  rateSource: string;
  rateSourceUrl: string;
  addressSource: string;
  addressSourceUrl: string;
  taxYear: number | null;
  generatedAt: string;
  parcels: number;
}

export interface Parcel {
  index: number;
  pin: string;
  address: string;
  /** Other units' site addresses, for condo stacks and developments */
  otherAddresses: string[];
  units: number;
  /** A condo or townhome development whose area is reconstructed, not a surveyed parcel */
  condoDevelopment: boolean;
  /** A vacant lot held with the built parcel next door (same taxpayer): a side yard, extra lot, or parking */
  heldWithNeighbor: boolean;
  useCode: string;
  landUse: LandUse;
  /** Set for vacant parcels: which kind of vacant land the assessor classes it as */
  vacantType: VacantType | null;
  city: string;
  taxCode: string;
  taxRate: number | null;
  tif: string | null;
  exempt: boolean;
  acres: number;
  /** Estimated market value (3 x EAV); null for exempt parcels or missing assessments */
  marketValue: number | null;
  /** Estimated tax before exemptions (EAV x tax code rate); null when either is unknown */
  tax: number | null;
  /** Land's share of assessed value, 0-1; null when the parcel has no assessed value */
  landShare: number | null;
  valuePerAcre: number | null;
  taxPerAcre: number | null;
}

export interface Parcels {
  meta: ParcelMeta;
  parcels: Parcel[];
  geojson: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, ParcelFeatureProps>;
  cities: { name: string; count: number }[];
}

export interface ParcelFeatureProps {
  i: number;
  city: string;
  use: LandUse;
  /** Vacant land type, set only on vacant parcels */
  vac?: VacantType;
  /** 1 on vacant parcels held with the built parcel next door */
  held?: 1;
  vpa?: number;
  land?: number;
}

// ---------------------------------------------------------------------------
// Land use groups (Champaign County property class codes)
// ---------------------------------------------------------------------------

export type LandUse =
  | "Residential"
  | "Commercial"
  | "Industrial"
  | "Vacant"
  | "Farm"
  | "Energy & mineral"
  | "Common areas"
  | "Exempt"
  | "Other";

export const LAND_USE_ORDER: LandUse[] = [
  "Residential",
  "Commercial",
  "Industrial",
  "Vacant",
  "Farm",
  "Energy & mineral",
  "Common areas",
  "Exempt",
  "Other",
];

export const PROPERTY_CLASSES: Record<string, string> = {
  "0000": "New parcel, unassessed",
  "0010": "Other land",
  "0011": "Farm homesite and dwelling",
  "0020": "Other land",
  "0021": "Farmland",
  "0025": "Commercial energy storage",
  "0026": "Solar energy",
  "0027": "Wind farm",
  "0028": "Conservation stewardship",
  "0029": "Wooded transition",
  "0030": "Vacant residential lot",
  "0031": "Residential common area",
  "0032": "Vacant residential land (10-30 acres)",
  "0040": "Improved residential",
  "0041": "Model home",
  "0043": "Low-income housing",
  "0050": "Vacant commercial lot",
  "0051": "Commercial common area",
  "0052": "Vacant commercial land (10-30 acres)",
  "0060": "Improved commercial",
  "0062": "Vacant commercial land (10-30 acres)",
  "0065": "Commercial with farm",
  "0070": "Commercial improvements",
  "0072": "Vacant commercial land (10-30 acres)",
  "0080": "Industrial",
  "0081": "Vacant industrial land",
  "0082": "Vacant industrial land (10-30 acres)",
  "0085": "Farm / industrial",
  "0090": "Tax exempt",
  "0091": "Permanent fallout",
  "0092": "University of Illinois",
  "0093": "Railroad drainage",
  "4500": "State-assessed railroad",
  "4600": "Pollution control",
  "5000": "Railroad",
  "7100": "Coal",
  "7101": "Developed coal",
  "7200": "Oil lease",
  "7300": "Limestone",
  "7400": "Sand and gravel",
  "7500": "Fluorspar",
  "7600": "Mineral",
  "8000": "Leasehold interest",
};

const VACANT_CLASSES = new Set(Object.keys(VACANT_CLASS_TYPES));

export function landUseFor(useCode: string, exempt: boolean): LandUse {
  if (exempt || ["0090", "0091", "0092", "0093"].includes(useCode)) return "Exempt";
  if (VACANT_CLASSES.has(useCode)) return "Vacant";
  if (["0040", "0041", "0043", "0011"].includes(useCode)) return "Residential";
  if (["0060", "0065", "0070"].includes(useCode)) return "Commercial";
  if (["0080", "0085"].includes(useCode)) return "Industrial";
  if (["0010", "0020", "0021", "0028", "0029"].includes(useCode)) return "Farm";
  if (["0031", "0051"].includes(useCode)) return "Common areas";
  if (["0025", "0026", "0027"].includes(useCode) || useCode.startsWith("7")) return "Energy & mineral";
  return "Other";
}

export function propertyClassLabel(useCode: string): string {
  if (!useCode) return "Unknown";
  return `${useCode} · ${PROPERTY_CLASSES[useCode] ?? "Other"}`;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function decodeRing(flat: number[]): GeoJSON.Position[] {
  const ring: GeoJSON.Position[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < flat.length; i += 2) {
    x += flat[i];
    y += flat[i + 1];
    ring.push([x / 1e5, y / 1e5]);
  }
  return ring;
}

function decodeParcels(data: ParcelDataset): Parcels {
  const { cols, dict } = data;
  const parcels: Parcel[] = [];
  const features: GeoJSON.Feature<GeoJSON.MultiPolygon, ParcelFeatureProps>[] = [];
  const cityCounts = new Map<string, number>();

  for (let i = 0; i < cols.pin.length; i += 1) {
    const useCode = dict.useCode[cols.useCode[i]];
    const exempt = cols.exempt[i] === 1;
    const city = dict.city[cols.city[i]] || "Unincorporated";
    const taxRate = dict.taxRate[cols.taxCode[i]];
    const eav = cols.eav[i];
    const acres = cols.area[i] / SQ_FT_PER_ACRE;
    const hasValue = !exempt && eav !== null && eav > 0;
    const marketValue = hasValue ? eav / ASSESSMENT_RATIO : exempt ? null : eav === 0 ? 0 : null;
    const tax = hasValue && taxRate !== null ? (eav * taxRate) / 100 : marketValue === 0 ? 0 : null;
    const assessed = cols.land[i] + cols.building[i];
    const landShare = !exempt && assessed > 0 ? cols.land[i] / assessed : null;
    const valuePerAcre = marketValue !== null && acres > 0 ? marketValue / acres : null;
    const taxPerAcre = tax !== null && acres > 0 ? tax / acres : null;

    const parcel: Parcel = {
      index: i,
      pin: cols.pin[i],
      address: cols.address[i],
      otherAddresses: cols.otherAddresses?.[i] ? cols.otherAddresses[i].split("|") : [],
      units: cols.units[i],
      condoDevelopment: cols.condoDev?.[i] === 1,
      heldWithNeighbor: cols.held?.[i] === 1,
      useCode,
      landUse: landUseFor(useCode, exempt),
      vacantType: exempt ? null : vacantTypeFor(useCode),
      city,
      taxCode: dict.taxCode[cols.taxCode[i]],
      taxRate,
      tif: dict.tif[cols.taxCode[i]],
      exempt,
      acres,
      marketValue,
      tax,
      landShare,
      valuePerAcre,
      taxPerAcre,
    };
    parcels.push(parcel);
    cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);

    // MapLibre's ["has", ...] treats a present-but-null property as present, so only set the
    // numeric properties when they have a value.
    const props: ParcelFeatureProps = { i, city, use: parcel.landUse };
    if (valuePerAcre !== null) props.vpa = valuePerAcre;
    if (landShare !== null) props.land = landShare;
    if (parcel.vacantType) props.vac = parcel.vacantType;
    if (parcel.vacantType && parcel.heldWithNeighbor) props.held = 1;
    features.push({
      type: "Feature",
      id: i,
      properties: props,
      geometry: { type: "MultiPolygon", coordinates: cols.geom[i].map((rings) => rings.map(decodeRing)) },
    });
  }

  const cities = [...cityCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { meta: data.meta, parcels, geojson: { type: "FeatureCollection", features }, cities };
}

let parcelsPromise: Promise<Parcels> | null = null;

export function loadParcels(): Promise<Parcels> {
  if (!parcelsPromise) {
    parcelsPromise = fetch(PARCEL_DATA_URL)
      .then((res) => {
        if (res.status === 404) {
          throw new Error("Parcel data not found. Build it with `npm run data:parcels` (takes about 3 minutes).");
        }
        if (!res.ok) throw new Error(`Failed to load parcel data (${res.status})`);
        return res.json() as Promise<ParcelDataset>;
      })
      .then(decodeParcels)
      .catch((error) => {
        parcelsPromise = null;
        throw error;
      });
  }
  return parcelsPromise;
}

// ---------------------------------------------------------------------------
// Area filters
// ---------------------------------------------------------------------------

export const CU_METRO = "cu";
export const ALL_COUNTY = "county";
const CU_METRO_CITIES = ["Champaign", "Urbana", "Savoy"];

export function areaLabel(area: string): string {
  if (area === CU_METRO) return "Champaign, Urbana & Savoy";
  if (area === ALL_COUNTY) return "All of Champaign County";
  return area;
}

export function areaCities(area: string): string[] | null {
  if (area === CU_METRO) return CU_METRO_CITIES;
  if (area === ALL_COUNTY) return null;
  return [area];
}

export function inArea(parcel: Parcel, area: string): boolean {
  const cities = areaCities(area);
  return cities === null || cities.includes(parcel.city);
}

export function boundsOfParcel(data: Parcels, parcel: Parcel): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of data.geojson.features[parcel.index].geometry.coordinates) {
    for (const [x, y] of polygon[0]) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

export function boundsOf(parcels: Parcels, area: string): [number, number, number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const parcel of parcels.parcels) {
    if (!inArea(parcel, area)) continue;
    for (const polygon of parcels.geojson.features[parcel.index].geometry.coordinates) {
      for (const [x, y] of polygon[0]) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export interface LandUseSummary {
  landUse: LandUse;
  parcels: number;
  acres: number;
  value: number;
  tax: number;
}

export interface AreaSummary {
  parcels: number;
  acres: number;
  taxableAcres: number;
  value: number;
  tax: number;
  vacantParcels: number;
  vacantAcres: number;
  byLandUse: LandUseSummary[];
}

export function summarize(parcels: Parcel[]): AreaSummary {
  const groups = new Map<LandUse, LandUseSummary>();
  const summary: AreaSummary = {
    parcels: 0,
    acres: 0,
    taxableAcres: 0,
    value: 0,
    tax: 0,
    vacantParcels: 0,
    vacantAcres: 0,
    byLandUse: [],
  };
  for (const parcel of parcels) {
    summary.parcels += 1;
    summary.acres += parcel.acres;
    if (!parcel.exempt) summary.taxableAcres += parcel.acres;
    summary.value += parcel.marketValue ?? 0;
    summary.tax += parcel.tax ?? 0;
    if (parcel.landUse === "Vacant") {
      summary.vacantParcels += 1;
      summary.vacantAcres += parcel.acres;
    }
    const group = groups.get(parcel.landUse) ?? { landUse: parcel.landUse, parcels: 0, acres: 0, value: 0, tax: 0 };
    group.parcels += 1;
    group.acres += parcel.acres;
    group.value += parcel.marketValue ?? 0;
    group.tax += parcel.tax ?? 0;
    groups.set(parcel.landUse, group);
  }
  summary.byLandUse = LAND_USE_ORDER.map((landUse) => groups.get(landUse)).filter(
    (group): group is LandUseSummary => Boolean(group && group.parcels > 0),
  );
  return summary;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatMoney(value: number | null, { compact = false } = {}): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
    if (abs >= 1e3) return `$${(value / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  }
  return `$${Math.round(value).toLocaleString()}`;
}

export function formatAcres(acres: number): string {
  if (acres >= 100) return Math.round(acres).toLocaleString();
  if (acres >= 1) return acres.toFixed(1);
  return acres.toFixed(2);
}

// County site addresses end with the city, sometimes followed by a unit ("518 BRADLEY AVE CHAMPAIGN",
// "1702 AIRPORT RD URBANA UNIT 5006"); the city is shown separately.
const ADDRESS_CITY_SUFFIX =
  /\s+(CHAMPAIGN|URBANA|SAVOY|MAHOMET|RANTOUL|ST\.? JOSEPH|SAINT JOSEPH|TOLONO|FISHER|PHILO|HOMER|SIDNEY|THOMASBORO|GIFFORD|OGDEN|PESOTUM|SADORUS|LUDLOW|BROADLANDS|BONDVILLE|IVESDALE|ROYAL|LONGVIEW|FOOSLAND|ALLERTON|SEYMOUR|DEWEY|PENFIELD|TUSCOLA|VILLA GROVE)(?=(\s+UNIT\b.*)?$)/i;

/** A site address for display: title case, without the trailing city name. */
export function displayAddress(address: string): string {
  return titleCaseAddress(address.trim().replace(ADDRESS_CITY_SUFFIX, ""));
}

export function titleCaseAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\b([a-z])/g, (char) => char.toUpperCase())
    .replace(/\b(Ne|Nw|Se|Sw)\b/g, (dir) => dir.toUpperCase());
}

// Opens the county's page for the same tax year as the values on the map.
export function countyParcelUrl(pin: string, taxYear: number | null): string {
  const year = taxYear ?? new Date().getFullYear() - 1;
  return `https://champaignil.devnetwedge.com/parcel/view/${pin}/${year}`;
}

export function formatPin(pin: string): string {
  return pin.length === 12 ? `${pin.slice(0, 2)}-${pin.slice(2, 4)}-${pin.slice(4, 6)}-${pin.slice(6, 9)}-${pin.slice(9)}` : pin;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// County site addresses use USPS-style abbreviations ("518 BRADLEY AVE CHAMPAIGN"); map common
// spelled-out words to them so "518 Bradley Avenue" still matches.
const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  STREET: "ST",
  AVENUE: "AVE",
  AV: "AVE",
  DRIVE: "DR",
  ROAD: "RD",
  BOULEVARD: "BLVD",
  COURT: "CT",
  LANE: "LN",
  PLACE: "PL",
  CIRCLE: "CIR",
  PARKWAY: "PKWY",
  TERRACE: "TER",
  HIGHWAY: "HWY",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
};

export function addressTokens(text: string): string[] {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ADDRESS_ABBREVIATIONS[token] ?? token);
}

export interface ParcelMatch {
  parcel: Parcel;
  /** The address that matched (a unit's address for multi-unit parcels), or "" for a parcel-number match */
  address: string;
}

/**
 * Parcels matching a typed address or parcel number. Every word typed must start a word in the
 * address, so "518 brad" finds 518 Bradley Ave. Multi-unit parcels match on any unit's address.
 * Digits-only input of 4+ characters also matches parcel numbers.
 */
export function searchParcels(parcels: Parcel[], query: string, limit = 8): ParcelMatch[] {
  const digits = query.replace(/[\s-]/g, "");
  const tokens = addressTokens(query);
  if (tokens.length === 0) return [];
  const results: (ParcelMatch & { score: number })[] = [];
  const pinQuery = /^\d{4,}$/.test(digits);
  for (const parcel of parcels) {
    if (pinQuery && parcel.pin.startsWith(digits)) {
      results.push({ parcel, address: "", score: 0 });
      continue;
    }
    for (const address of parcel.address ? [parcel.address, ...parcel.otherAddresses] : []) {
      const words = addressTokens(address);
      if (!tokens.every((token) => words.some((word) => word.startsWith(token)))) continue;
      // Prefer an exact house-number match, then shorter addresses.
      results.push({ parcel, address, score: (words[0] === tokens[0] ? 0 : 1) + address.length / 1000 });
      break;
    }
  }
  return results
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ parcel, address }) => ({ parcel, address }));
}

/** The parcel containing a point, if any. */
export function parcelAt(data: Parcels, lng: number, lat: number): Parcel | null {
  for (const feature of data.geojson.features) {
    for (const polygon of feature.geometry.coordinates) {
      if (pointInRing(lng, lat, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(lng, lat, hole))) {
        return data.parcels[feature.properties.i];
      }
    }
  }
  return null;
}

function pointInRing(x: number, y: number, ring: GeoJSON.Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Percentiles
// ---------------------------------------------------------------------------

export interface PercentileTable {
  valuePerAcre: number[];
  value: number[];
}

/** Whether a parcel belongs in the percentile comparison: taxable, assessed at market value, with a value. */
function comparable(parcel: Parcel): boolean {
  return !parcel.exempt && parcel.landUse !== "Farm" && (parcel.marketValue ?? 0) > 0 && parcel.valuePerAcre !== null;
}

export function percentileTable(parcels: Parcel[]): PercentileTable {
  const group = parcels.filter(comparable);
  return {
    valuePerAcre: group.map((parcel) => parcel.valuePerAcre as number).sort((a, b) => a - b),
    value: group.map((parcel) => parcel.marketValue as number).sort((a, b) => a - b),
  };
}

/** Share of the sorted values strictly below `value`, 0-100. */
function percentileOf(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return sorted.length ? (lo / sorted.length) * 100 : 0;
}

/**
 * A rounded percentile label. The data isn't exact, so ranks are rounded to the nearest 10th
 * percentile, except the tails: "Bottom 5%" and "Top 5%".
 */
export function percentileLabel(percentile: number): string {
  if (percentile < 5) return "Bottom 5%";
  if (percentile > 95) return "Top 5%";
  // The tilde marks the rounded middle values as estimates; the tails are already ranges.
  return `~${Math.min(90, Math.max(10, Math.round(percentile / 10) * 10))}th percentile`;
}

export interface ParcelRanks {
  valuePerAcre: string;
  value: string;
}

export function rankParcel(table: PercentileTable, parcel: Parcel): ParcelRanks | null {
  if (!comparable(parcel) || table.value.length === 0) return null;
  return {
    valuePerAcre: percentileLabel(percentileOf(table.valuePerAcre, parcel.valuePerAcre as number)),
    value: percentileLabel(percentileOf(table.value, parcel.marketValue as number)),
  };
}
