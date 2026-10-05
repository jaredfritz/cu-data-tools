// Map styling for /data/value-per-acre. Breaks and extrusion heights are adapted from Strong Towns
// Chicago's scales.js and rescaled for Champaign County, where values run lower than Chicago's.
// Chicago's red-to-green ramp is replaced with colorblind-safe continuous gradients whose lightness
// runs in one direction, plus an optional red/blue scale centered on the selected area's average.

export const PARCEL_BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
export { BASEMAP_ATTRIBUTION } from "./crashMapStyles";

export const CU_VIEW_STATE = { longitude: -88.235, latitude: 40.105, zoom: 12.2, pitch: 0, bearing: 0 };
export const VIEW_3D = { pitch: 55, bearing: -20 };

export const MIN_ZOOM = 8;
export const MAX_ZOOM = 18;

// Farmland is assessed on what it can produce, not on market value, so it sits outside the value scale
// in a neutral tan rather than reading as the lowest-value developed land.
export const FARM_COLOR = "#d8c8a0";
export const FARM_LABEL = "Farmland (assessed on productivity, not market value)";
// Exempt parcels and parcels without an assessment get a gray diagonal hatch, so they never read
// as a value on any color scale (including the neutral midpoint of the "vs. average" scale).
export const NO_DATA_PATTERN = "parcel-no-data-hatch";
export const NO_DATA_SWATCH =
  "repeating-linear-gradient(135deg, #a3a3a3 0 1.5px, #ececec 1.5px 4px)";

// A tax-per-acre view was removed: with one rate per city it mirrored value per acre. Bring it back once
// exemption data gives net tax (see docs/value-per-acre-next-steps.md).
export type ParcelMetric = "value" | "land";

/** "bands" colors by fixed dollar bands; "average" colors by how a parcel compares to the area average. */
export type ColorScale = "bands" | "average";

export const COLOR_SCALES: { id: ColorScale; label: string }[] = [
  { id: "bands", label: "Dollar bands" },
  { id: "average", label: "vs. area average" },
];

/** A color anchor. Parcels between two anchors get a color blended between them. */
export interface Stop {
  value: number;
  label: string;
  color: string;
}

export interface MetricConfig {
  id: ParcelMetric;
  label: string;
  /** Feature property holding the value */
  field: "vpa" | "land";
  description: string;
  stops: Stop[];
  /** Blend on a log scale (each doubling moves the same distance along the colors) */
  logScale: boolean;
  noDataLabel: string;
  /** Property and [value, meters] stops for the 3D extrusion height */
  heightField: "vpa";
  heights: [number, number][];
}

const VALUE_HEIGHTS: [number, number][] = [
  [0, 0],
  [1_000_000, 30],
  [5_000_000, 150],
  [10_000_000, 300],
  [25_000_000, 600],
  [50_000_000, 1000],
  [200_000_000, 2000],
];

// Multi-hue sequential ramp (after ColorBrewer YlGnBu): pale yellow (low) through green and teal to
// navy (high). Lightness falls steadily, so order survives color blindness and grayscale. Its middle,
// where most neighborhoods sit, is a calm green-teal rather than an alarming red, and the two darkest
// anchors give city cores ($5M-$25M+ per acre) their own range.
const VALUE_RAMP = ["#fde98f", "#a8d99a", "#6cc4ad", "#3aa6bc", "#2483bd", "#255fa6", "#223c83", "#0d2259"];
// Diverging ramp for "vs. area average" (after ColorBrewer RdBu): red below, blue above, neutral at average.
const AVERAGE_COLORS = ["#a50f26", "#d6604d", "#f4a582", "#ece9e1", "#7fb6d9", "#3b86c0", "#1a4f8f"];
// Single-hue ramp for land share, light (low) to dark (high).
const ORANGE = ["#fde3d3", "#f9c0a0", "#f39a6c", "#eb6834", "#c8521f", "#9c3e14"];

const anchors = (values: number[], labels: string[], colors: string[]): Stop[] =>
  values.map((value, index) => ({ value, label: labels[index], color: colors[index] }));

export const MAP_METRICS: MetricConfig[] = [
  {
    id: "value",
    label: "Value per acre",
    field: "vpa",
    description: "Estimated market value (3 × equalized assessed value) divided by parcel area.",
    noDataLabel: "Exempt or no assessment",
    stops: anchors(
      // Anchors sit near C-U parcel percentiles (10th, 20th, 35th, 50th, 65th, 80th, 95th, 99th), so each stretch
      // of the ramp covers a similar share of parcels: yellow marks the lowest tenth, the green-teal middle spreads
      // out ordinary neighborhoods, and navy is reserved for city cores.
      [450_000, 700_000, 900_000, 1_100_000, 1_400_000, 2_000_000, 5_000_000, 12_000_000],
      ["$450k or less", "$700k", "$900k", "$1.1M", "$1.4M", "$2M", "$5M", "$12M or more"],
      VALUE_RAMP,
    ),
    logScale: true,
    heightField: "vpa",
    heights: VALUE_HEIGHTS,
  },
  {
    id: "land",
    label: "Land share of value",
    field: "land",
    description:
      "The share of a parcel's assessed value that is land rather than buildings. High shares mark land that is " +
      "vacant or lightly used for its location, like surface parking.",
    noDataLabel: "Exempt or no assessment",
    stops: anchors([0, 0.2, 0.4, 0.6, 0.8, 1], ["0%", "20%", "40%", "60%", "80%", "100%"], ORANGE),
    logScale: false,
    // Height stays value per acre, so tall-but-orange parcels are valuable land holding little building.
    heightField: "vpa",
    heights: VALUE_HEIGHTS,
  },
];

export function metricConfig(id: ParcelMetric): MetricConfig {
  return MAP_METRICS.find((metric) => metric.id === id) ?? MAP_METRICS[0];
}

export function supportsAverageScale(metric: MetricConfig): boolean {
  return metric.field !== "land";
}

/**
 * The color anchors in effect. For "vs. area average" they are multiples of the area average,
 * blended on a log scale so ½× and 2× sit the same distance from the neutral midpoint.
 */
export function stopsFor(metric: MetricConfig, scale: ColorScale, average: number | null): Stop[] {
  if (scale !== "average" || !supportsAverageScale(metric) || !average || average <= 0) return metric.stops;
  return anchors(
    [0.25, 0.5, 0.8, 1, 1.25, 2, 4].map((ratio) => ratio * average),
    ["¼ of average or less", "½ of average", "", "Area average", "", "2× average", "4× average or more"],
    AVERAGE_COLORS,
  );
}

// Values at or below zero (common areas) can't go through ln(); clamp them to a tiny positive value,
// which lands on the lowest color.
const position = (value: number, logScale: boolean) => (logScale ? Math.log(Math.max(value, 1e-6)) : value);

export function colorExpression(metric: MetricConfig, stops: Stop[] = metric.stops): unknown[] {
  const value = ["get", metric.field];
  const input = metric.logScale ? ["ln", ["max", value, 1e-6]] : value;
  return [
    "case",
    // No-data parcels are drawn by their own hatched layer; this color only applies in 3D, where they stay flat.
    ["!", ["has", metric.field]],
    "#d4d4d4",
    ["==", ["get", "use"], "Farm"],
    FARM_COLOR,
    ["interpolate-lab", ["linear"], input, ...stops.flatMap((stop) => [position(stop.value, metric.logScale), stop.color])],
  ];
}

/**
 * Where each anchor sits along the legend bar (0 = bottom, 1 = top). Anchors are spaced evenly and
 * labeled with their exact values: the value anchors are percentile-based, so even spacing shows each
 * stretch of color covering a similar share of parcels.
 */
export function legendPositions(stops: Stop[]): number[] {
  return stops.map((_, index) => index / Math.max(stops.length - 1, 1));
}

export function legendGradient(stops: Stop[], positions: number[]): string {
  return `linear-gradient(to top, ${stops.map((stop, index) => `${stop.color} ${(positions[index] * 100).toFixed(1)}%`).join(", ")})`;
}

export function heightExpression(metric: MetricConfig): unknown[] {
  return [
    "case",
    ["!", ["has", metric.heightField]],
    0,
    ["interpolate", ["linear"], ["get", metric.heightField], ...metric.heights.flat()],
  ];
}

/** An 8x8 RGBA diagonal hatch for MapLibre's addImage, used as the no-data fill pattern. */
export function noDataHatchImage(): { width: number; height: number; data: Uint8Array } {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const onLine = (x + y) % size < 2;
      const [r, g, b, a] = onLine ? [163, 163, 163, 255] : [236, 236, 236, 220];
      data.set([r, g, b, a], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

export function areaFilter(cities: string[] | null): unknown[] {
  return cities === null ? ["all"] : ["in", ["get", "city"], ["literal", cities]];
}
