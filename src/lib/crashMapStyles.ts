// Map styling for the crash pages, adapted from the Chicago Crash Dashboard's mapStyles.ts.

export const CRASH_BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
// CARTO's tiles credit CARTO and OpenStreetMap; the Positron style's license also asks for OpenMapTiles.
export const BASEMAP_ATTRIBUTION = { customAttribution: '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a>' };

// Downtown Champaign / Urbana, zoomed to show both cities
export const CU_VIEW_STATE = { longitude: -88.235, latitude: 40.11, zoom: 11.6, pitch: 0, bearing: 0 };

export const MIN_ZOOM = 8;
export const MAX_ZOOM = 18;

export const SEVERITY_LEGEND = [
  { label: "Fatal", color: "#dc2626" },
  { label: "Incapacitating Injury", color: "#ea580c" },
  { label: "Other Injury", color: "#eab308" },
  { label: "No Injury", color: "#22c55e" },
];

export const SEVERITY_COLOR_EXPRESSION = [
  "match",
  ["get", "severity"],
  "K", "#dc2626",
  "A", "#ea580c",
  "B", "#eab308",
  "C", "#eab308",
  "#22c55e",
];

export type MapMetric = "severity" | "hit_and_run" | "crash_type" | "heavy_vehicle";

export interface MetricConfig {
  id: MapMetric;
  label: string;
  legend: { label: string; color: string }[];
  colorExpression: unknown[];
  getFilterExpression: (visibleLabels: Set<string>) => unknown[];
}

const NOTHING = ["==", 1, 0];

export const MAP_METRICS: MetricConfig[] = [
  {
    id: "severity",
    label: "Severity",
    legend: SEVERITY_LEGEND,
    colorExpression: SEVERITY_COLOR_EXPRESSION,
    getFilterExpression: (visible) => {
      const codes = [
        ...(visible.has("Fatal") ? ["K"] : []),
        ...(visible.has("Incapacitating Injury") ? ["A"] : []),
        ...(visible.has("Other Injury") ? ["B", "C"] : []),
        ...(visible.has("No Injury") ? ["O"] : []),
      ];
      return codes.length ? ["in", ["get", "severity"], ["literal", codes]] : NOTHING;
    },
  },
  {
    id: "hit_and_run",
    label: "Hit and Run",
    legend: [
      { label: "Hit and Run", color: "#9333ea" },
      { label: "Not Hit and Run", color: "#6b7280" },
    ],
    colorExpression: ["case", ["==", ["get", "hit_and_run"], true], "#9333ea", "#6b7280"],
    getFilterExpression: (visible) => {
      const conditions: unknown[] = ["any"];
      if (visible.has("Hit and Run")) conditions.push(["==", ["get", "hit_and_run"], true]);
      if (visible.has("Not Hit and Run")) conditions.push(["!=", ["get", "hit_and_run"], true]);
      return conditions.length > 1 ? conditions : NOTHING;
    },
  },
  {
    id: "crash_type",
    label: "Crash Type",
    legend: [
      { label: "Pedestrian", color: "#dc2626" },
      { label: "Bicycle", color: "#ea580c" },
      { label: "Other", color: "#3b82f6" },
    ],
    colorExpression: [
      "match",
      ["get", "crash_type"],
      "Pedestrian", "#dc2626",
      "Pedalcyclist", "#ea580c",
      "#3b82f6",
    ],
    getFilterExpression: (visible) => {
      const conditions: unknown[] = ["any"];
      if (visible.has("Pedestrian")) conditions.push(["==", ["get", "crash_type"], "Pedestrian"]);
      if (visible.has("Bicycle")) conditions.push(["==", ["get", "crash_type"], "Pedalcyclist"]);
      if (visible.has("Other")) {
        conditions.push(["!", ["in", ["get", "crash_type"], ["literal", ["Pedestrian", "Pedalcyclist"]]]]);
      }
      return conditions.length > 1 ? conditions : NOTHING;
    },
  },
  {
    id: "heavy_vehicle",
    label: "Heavy Vehicle",
    legend: [
      { label: "Heavy vehicle", color: "#0891b2" },
      { label: "No heavy vehicle", color: "#6b7280" },
      { label: "Not available", color: "#d1d5db" },
    ],
    colorExpression: ["match", ["get", "heavy"], 1, "#0891b2", 0, "#6b7280", "#d1d5db"],
    getFilterExpression: (visible) => {
      const values = [
        ...(visible.has("Heavy vehicle") ? [1] : []),
        ...(visible.has("No heavy vehicle") ? [0] : []),
        ...(visible.has("Not available") ? [-1] : []),
      ];
      return values.length ? ["in", ["get", "heavy"], ["literal", values]] : NOTHING;
    },
  },
];
