"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ZoningAbout from "./ZoningAbout";
import { Info } from "lucide-react";
import Map, { Layer, Marker, Source, MapMouseEvent, MapRef } from "react-map-gl/maplibre";
import type { FilterSpecification, DataDrivenPropertyValueSpecification, ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  DISTRICTS,
  ZONE_COLOR_MAP,
  ZoneFeatureProperties,
  ZONE_DETAILS,
  getZoneDescription,
  getZoneDistrict,
} from "@/lib/zoning";
import { BuildType, BUILD_COLORS } from "@/lib/buildTypes";
import { findZoneAtPointOrNearest } from "@/lib/geo";
import { PermitFeatureProperties, SelectedPermit } from "@/lib/permits";

const TILE_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const CHAMPAIGN_CENTER = { lng: -88.2434, lat: 40.1164 };
const SHOW_BUILD_HACHURE = true;
const DEFAULT_SF_PERMIT_COLOR = "#1F6CB0";
const DEFAULT_MF_PERMIT_COLOR = "#B9387A";
const DEFAULT_OTHER_PERMIT_COLOR = "#6b7280";
const LEGEND_RADIUS_1_UNIT_PX = 3;
const LEGEND_RADIUS_100_UNITS_PX = 17;
const DISTRICT_COLOR_BY_ID = Object.fromEntries(DISTRICTS.map((district) => [district.id, district.color]));
const ZONING_DISTRICT_LEGEND = [
  { label: "Residential", color: DISTRICT_COLOR_BY_ID["residential"] ?? "#93c5fd" },
  { label: "In-Town", color: DISTRICT_COLOR_BY_ID["in-town"] ?? "#c4b5fd" },
  { label: "Commercial", color: DISTRICT_COLOR_BY_ID["commercial"] ?? "#fcd34d" },
  { label: "Industrial", color: DISTRICT_COLOR_BY_ID["industrial"] ?? "#fb923c" },
] as const;

export interface MapStyleOverrides {
  zoningColors?: Record<string, string>;
  buildColors?: {
    allowed?: string;
    provisional?: string;
    notAllowed?: string;
  };
  permitColors?: {
    sf?: string;
    mf?: string;
    other?: string;
  };
  permitSizeScale?: number;
}

function getFeatureCollectionBounds(data: GeoJSON.FeatureCollection): [number, number, number, number] | null {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  function visitCoords(coords: unknown): void {
    if (!Array.isArray(coords)) return;
    if (
      coords.length >= 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      const lng = coords[0];
      const lat = coords[1];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const item of coords) visitCoords(item);
  }

  for (const feature of data.features) {
    if (!feature.geometry) continue;
    if (feature.geometry.type === "GeometryCollection") {
      for (const geom of feature.geometry.geometries) {
        if ("coordinates" in geom) visitCoords(geom.coordinates);
      }
    } else if ("coordinates" in feature.geometry) {
      visitCoords(feature.geometry.coordinates);
    }
  }

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }

  return [minLng, minLat, maxLng, maxLat];
}

function mergeBounds(
  boundsList: Array<[number, number, number, number] | null>
): [number, number, number, number] | null {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const bounds of boundsList) {
    if (!bounds) continue;
    minLng = Math.min(minLng, bounds[0]);
    minLat = Math.min(minLat, bounds[1]);
    maxLng = Math.max(maxLng, bounds[2]);
    maxLat = Math.max(maxLat, bounds[3]);
  }

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }

  return [minLng, minLat, maxLng, maxLat];
}

type RoadLabelBaseStyle = {
  min: number;
  max: number;
  textSize?: unknown;
  textHaloWidth?: unknown;
  textHaloColor?: unknown;
};

function applyThoroughfareLabelDraft(
  map: MapLibreMap,
  minZoomReduction = 2,
  baseStyles?: Record<string, RoadLabelBaseStyle>
) {
  const style = map.getStyle();
  if (!style?.layers) return;
  const normalizedBoost = Math.min(Math.max(minZoomReduction / 8, 0), 1);
  const labelSizeFactor = 1 + normalizedBoost * 0.55;
  const extraHaloWidth = normalizedBoost * 1.2;

  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const layerDef = layer as {
      id: string;
      layout?: Record<string, unknown>;
      paint?: Record<string, unknown>;
      source?: string;
      "source-layer"?: string;
    };
    const hasTextField = Boolean(layerDef.layout?.["text-field"]);
    if (!hasTextField) continue;

    const id = layerDef.id.toLowerCase();
    const sourceLayer = (layerDef["source-layer"] ?? "").toLowerCase();
    const isRoadLabelLayer =
      id.includes("road") ||
      id.includes("street") ||
      id.includes("highway") ||
      sourceLayer.includes("transport") ||
      sourceLayer.includes("road");
    if (!isRoadLabelLayer) continue;

    try {
      const existingBase = baseStyles?.[layerDef.id];
      const min = existingBase
        ? existingBase.min
        : (typeof (layer as { minzoom?: unknown }).minzoom === "number"
          ? (layer as { minzoom?: number }).minzoom!
          : 0);
      const max = existingBase
        ? existingBase.max
        : (typeof (layer as { maxzoom?: unknown }).maxzoom === "number"
          ? (layer as { maxzoom?: number }).maxzoom!
          : 24);
      const baseTextSize = existingBase?.textSize ?? layerDef.layout?.["text-size"];
      const baseHaloWidth = existingBase?.textHaloWidth ?? layerDef.paint?.["text-halo-width"];
      const baseHaloColor = existingBase?.textHaloColor ?? layerDef.paint?.["text-halo-color"];
      if (baseStyles && !existingBase) {
        baseStyles[layerDef.id] = {
          min,
          max,
          textSize: baseTextSize,
          textHaloWidth: baseHaloWidth,
          textHaloColor: baseHaloColor,
        };
      }
      const loweredMin = Math.max(0, min - minZoomReduction);
      map.setLayerZoomRange(layerDef.id, loweredMin, max);

      if (baseTextSize !== undefined) {
        if (typeof baseTextSize === "number") {
          map.setLayoutProperty(layerDef.id, "text-size", (baseTextSize * labelSizeFactor) as never);
        } else if (Array.isArray(baseTextSize)) {
          // Only boost expression-based text sizes. Legacy object function definitions are skipped.
          const boostedExpr = ["*", ["to-number", baseTextSize as unknown, 12], labelSizeFactor] as unknown;
          map.setLayoutProperty(layerDef.id, "text-size", boostedExpr as never);
        }
      }
      const haloWidthBase = typeof baseHaloWidth === "number" ? baseHaloWidth : 0;
      map.setPaintProperty(layerDef.id, "text-halo-width", haloWidthBase + extraHaloWidth);
      map.setPaintProperty(layerDef.id, "text-halo-color", baseHaloColor ?? "rgba(255,255,255,0.92)");
    } catch {
      // Ignore style-layer mismatches across third-party basemap style versions.
    }
  }
}

function darken(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - 30);
  const g = Math.max(0, ((n >> 8) & 0xff) - 30);
  const b = Math.max(0, (n & 0xff) - 30);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// Normal mode: color by zone code
function buildFillColorExpr(
  activeCodes: Set<string>,
  zoneColorMap: Record<string, string>
): DataDrivenPropertyValueSpecification<string> {
  const arms: string[] = [];
  for (const [code, color] of Object.entries(zoneColorMap)) {
    if (activeCodes.has(code)) arms.push(code, color);
  }
  if (arms.length === 0) return "rgba(0,0,0,0)";
  return ["match", ["get", "zoning_code"], ...arms, "#e5e7eb"] as unknown as DataDrivenPropertyValueSpecification<string>;
}

function buildHoverColorExpr(
  activeCodes: Set<string>,
  zoneColorMap: Record<string, string>
): DataDrivenPropertyValueSpecification<string> {
  const arms: string[] = [];
  for (const [code, color] of Object.entries(zoneColorMap)) {
    if (activeCodes.has(code)) arms.push(code, darken(color));
  }
  if (arms.length === 0) return "rgba(0,0,0,0)";
  return ["match", ["get", "zoning_code"], ...arms, "#9ca3af"] as unknown as DataDrivenPropertyValueSpecification<string>;
}

function buildVisibilityFilter(activeCodes: Set<string>): FilterSpecification {
  const codes = Array.from(activeCodes);
  if (codes.length === 0) {
    return ["==", ["get", "OBJECTID"], -1] as unknown as FilterSpecification;
  }
  return ["in", ["get", "zoning_code"], ["literal", codes]] as unknown as FilterSpecification;
}

// Build mode: blue for by-right, amber for provisional, rose for not-allowed, gray for others
function buildModeFillColor(
  bt: BuildType,
  buildColors: { allowed: string; provisional: string; notAllowed: string }
): DataDrivenPropertyValueSpecification<string> {
  const arms: unknown[] = [];
  if (bt.allowedCodes.length > 0) arms.push(bt.allowedCodes, buildColors.allowed);
  if (bt.provisionalCodes && bt.provisionalCodes.length > 0) arms.push(bt.provisionalCodes, buildColors.provisional);
  if (bt.notAllowedCodes.length > 0) arms.push(bt.notAllowedCodes, buildColors.notAllowed);
  return ["match", ["get", "zoning_code"], ...arms, "#d1d5db"] as unknown as DataDrivenPropertyValueSpecification<string>;
}

function buildModeHoverColor(
  bt: BuildType,
  buildColors: { allowed: string; provisional: string; notAllowed: string }
): DataDrivenPropertyValueSpecification<string> {
  const arms: unknown[] = [];
  if (bt.allowedCodes.length > 0) arms.push(bt.allowedCodes, darken(buildColors.allowed));
  if (bt.provisionalCodes && bt.provisionalCodes.length > 0) arms.push(bt.provisionalCodes, darken(buildColors.provisional));
  if (bt.notAllowedCodes.length > 0) arms.push(bt.notAllowedCodes, darken(buildColors.notAllowed));
  return ["match", ["get", "zoning_code"], ...arms, "#9ca3af"] as unknown as DataDrivenPropertyValueSpecification<string>;
}

const PERMIT_RADIUS_STOPS = [
  { units: 1, normal: 3.5, hover: 5 },
  { units: 2, normal: 4.5, hover: 6 },
  { units: 4, normal: 6.5, hover: 8 },
  { units: 8, normal: 9, hover: 10.5 },
  { units: 20, normal: 12.5, hover: 14 },
  { units: 50, normal: 15.5, hover: 17 },
  { units: 150, normal: 19.5, hover: 21 },
  { units: 322, normal: 22.5, hover: 24 },
] as const;

function buildPermitRadiusExpression(hoveredPermitId: number | null, scale: number): ExpressionSpecification {
  const normalStops = PERMIT_RADIUS_STOPS.flatMap((stop) => [stop.units, stop.normal * scale]);
  const hoverStops = PERMIT_RADIUS_STOPS.flatMap((stop) => [stop.units, stop.hover * scale]);
  return [
    "case",
    ["==", ["id"], hoveredPermitId ?? -1],
    ["interpolate", ["linear"], ["to-number", ["get", "units"], 1], ...hoverStops],
    ["interpolate", ["linear"], ["to-number", ["get", "units"], 1], ...normalStops],
  ] as unknown as ExpressionSpecification;
}

interface ZoningMapProps {
  data: GeoJSON.FeatureCollection;
  activeCodes: Set<string>;
  activeBuild: BuildType | null;
  permitsData: GeoJSON.FeatureCollection;
  showPermits: boolean;
  permitRenderMode: "points" | "heatmap";
  permitYearRange: { from: number; to: number } | null;
  selectedId: number | null;
  onSelectFeature: (feature: GeoJSON.Feature<GeoJSON.Geometry, ZoneFeatureProperties> | null) => void;
  onSelectPermit: (permit: SelectedPermit | null) => void;
  searchPin: { lat: number; lng: number } | null;
  fitPaddingPx?: number;
  fitPaddingRatio?: number;
  fitBoundsCollections?: GeoJSON.FeatureCollection[];
  majorRoadLabelZoomReduction?: number;
  interactive?: boolean;
  showOverlayUi?: boolean;
  onMapIdle?: (map: MapLibreMap) => void;
  styleOverrides?: MapStyleOverrides;
}

export default function ZoningMap({
  data,
  activeCodes,
  activeBuild,
  permitsData,
  showPermits,
  permitRenderMode,
  permitYearRange,
  selectedId,
  onSelectFeature,
  onSelectPermit,
  searchPin,
  fitPaddingPx = 36,
  fitPaddingRatio,
  fitBoundsCollections,
  majorRoadLabelZoomReduction = 2,
  interactive = true,
  showOverlayUi = true,
  onMapIdle,
  styleOverrides,
}: ZoningMapProps) {
  const mapRef = useRef<MapRef>(null);
  const roadLabelBaseStylesRef = useRef<Record<string, RoadLabelBaseStyle>>({});
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [hoveredPermitId, setHoveredPermitId] = useState<number | null>(null);
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    code: string;
    description: string;
    districtLabel: string;
    buildStatus: "allowed" | "provisional" | "notAllowed" | null;
  } | null>(null);

  const applyPrintViewportAndLabels = useCallback(
    (map: MapLibreMap) => {
      // Draft map readability tuning: stronger major thoroughfare labels.
      applyThoroughfareLabelDraft(
        map,
        majorRoadLabelZoomReduction,
        roadLabelBaseStylesRef.current
      );

      const collectionsToFit = fitBoundsCollections ?? [data];
      const bounds = mergeBounds(collectionsToFit.map((collection) => getFeatureCollectionBounds(collection)));
      if (bounds) {
        const paddingFromRatio = typeof fitPaddingRatio === "number"
          ? Math.round(
              Math.min(map.getCanvas().clientWidth, map.getCanvas().clientHeight) * fitPaddingRatio
            )
          : null;
        map.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          {
            padding: paddingFromRatio ?? fitPaddingPx,
            duration: 0,
            maxZoom: 15,
          }
        );
      }
      if (onMapIdle) {
        map.once("idle", () => {
          onMapIdle(map);
        });
      }
    },
    [
      data,
      fitBoundsCollections,
      fitPaddingPx,
      fitPaddingRatio,
      majorRoadLabelZoomReduction,
      onMapIdle,
    ]
  );

  // Register hachure sprite on map load
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (SHOW_BUILD_HACHURE) {
      const size = 10;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><line x1="0" y1="0" x2="${size}" y2="${size}" stroke="rgba(90,39,53,0.24)" stroke-width="1"/></svg>`;
      const img = new Image(size, size);
      img.onload = () => {
        if (!map.hasImage("hachure")) {
          map.addImage("hachure", img, { pixelRatio: 2 });
        }
      };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
    applyPrintViewportAndLabels(map);
  }, [applyPrintViewportAndLabels]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (!map.loaded()) return;
    applyPrintViewportAndLabels(map);
  }, [applyPrintViewportAndLabels]);

  // Fly to searched address when pin changes
  useEffect(() => {
    if (!searchPin) return;
    mapRef.current?.getMap()?.flyTo({
      center: [searchPin.lng, searchPin.lat],
      zoom: 15,
      duration: 1400,
    });
  }, [searchPin]);

  const handleMouseMove = useCallback(
    (e: MapMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      if (showPermits && permitRenderMode === "points") {
        const permitLayerReady = Boolean(map.getLayer("residential-permits-circles"));
        const permitFeatures = permitLayerReady
          ? map.queryRenderedFeatures(e.point, { layers: ["residential-permits-circles"] })
          : [];
        if (permitFeatures.length > 0) {
          map.getCanvas().style.cursor = "pointer";
          const pid = typeof permitFeatures[0].id === "number" ? permitFeatures[0].id : null;
          if (pid !== hoveredPermitId) setHoveredPermitId(pid);
          setTooltip(null);
          return;
        }
      }
      if (hoveredPermitId !== null) setHoveredPermitId(null);
      const zoningLayerReady = Boolean(map.getLayer("zoning-fill"));
      const features = zoningLayerReady
        ? map.queryRenderedFeatures(e.point, { layers: ["zoning-fill"] })
        : [];
      if (features.length > 0) {
        const f = features[0];
        const id = f.properties?.OBJECTID as number;
        const code = f.properties?.zoning_code as string;
        map.getCanvas().style.cursor = "pointer";
        if (id !== hoveredId) setHoveredId(id);

        let buildStatus: "allowed" | "provisional" | "notAllowed" | null = null;
        if (activeBuild) {
          if (activeBuild.allowedCodes.includes(code)) buildStatus = "allowed";
          else if (activeBuild.provisionalCodes?.includes(code)) buildStatus = "provisional";
          else if (activeBuild.notAllowedCodes.includes(code)) buildStatus = "notAllowed";
        }

        setTooltip({
          x: e.point.x,
          y: e.point.y,
          code,
          description: getZoneDescription(code),
          districtLabel: getZoneDistrict(code)?.shortLabel ?? "",
          buildStatus,
        });
      } else {
        map.getCanvas().style.cursor = "";
        setHoveredId(null);
        setTooltip(null);
      }
    },
    [hoveredId, hoveredPermitId, activeBuild, showPermits, permitRenderMode]
  );

  const handleMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = "";
    setHoveredId(null);
    setHoveredPermitId(null);
    setTooltip(null);
  }, []);

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      if (showPermits && permitRenderMode === "points") {
        const permitLayerReady = Boolean(map.getLayer("residential-permits-circles"));
        const permitFeatures = permitLayerReady
          ? map.queryRenderedFeatures(e.point, { layers: ["residential-permits-circles"] })
          : [];
        if (permitFeatures.length > 0) {
          const p = permitFeatures[0].properties as unknown as PermitFeatureProperties;
          const lngLat = (permitFeatures[0].geometry as GeoJSON.Point | undefined)?.coordinates;
          let zoneCode: string | null = null;
          let zoneCodeLabel = "—";
          let zoneDescription = "—";
          if (lngLat && lngLat.length >= 2) {
            const containingZone = findZoneAtPointOrNearest(data, lngLat[0], lngLat[1]) as GeoJSON.Feature<
              GeoJSON.Geometry,
              ZoneFeatureProperties
            > | null;
            zoneCode = containingZone?.properties?.zoning_code ?? null;
            if (zoneCode) {
              const fullName = getZoneDescription(zoneCode);
              zoneCodeLabel = `${zoneCode} — ${fullName}`;
              zoneDescription = ZONE_DETAILS[zoneCode] ?? fullName;
            }
          }
          onSelectPermit({
            permitNo: p.permit_no ?? "—",
            year: typeof p.year === "number" ? p.year : null,
            address: p.address ?? "—",
            buildingType: p.building_type ?? "—",
            units: typeof p.units === "number" ? p.units : null,
            zoneCode,
            zoneCodeLabel,
            zoneDescription,
          });
          return;
        }
      }
      const zoningLayerReady = Boolean(map.getLayer("zoning-fill"));
      const features = zoningLayerReady
        ? map.queryRenderedFeatures(e.point, { layers: ["zoning-fill"] })
        : [];
      if (features.length > 0) {
        onSelectPermit(null);
        onSelectFeature(features[0] as unknown as GeoJSON.Feature<GeoJSON.Geometry, ZoneFeatureProperties>);
      } else {
        onSelectPermit(null);
        onSelectFeature(null);
      }
    },
    [data, onSelectFeature, onSelectPermit, showPermits, permitRenderMode]
  );

  const inBuildMode = activeBuild !== null;
  const resolvedZoneColors = { ...ZONE_COLOR_MAP, ...(styleOverrides?.zoningColors ?? {}) };
  const resolvedBuildColors = {
    allowed: styleOverrides?.buildColors?.allowed ?? BUILD_COLORS.allowed,
    provisional: styleOverrides?.buildColors?.provisional ?? BUILD_COLORS.provisional,
    notAllowed: styleOverrides?.buildColors?.notAllowed ?? BUILD_COLORS.notAllowed,
  };
  const resolvedPermitColors = {
    sf: styleOverrides?.permitColors?.sf ?? DEFAULT_SF_PERMIT_COLOR,
    mf: styleOverrides?.permitColors?.mf ?? DEFAULT_MF_PERMIT_COLOR,
    other: styleOverrides?.permitColors?.other ?? DEFAULT_OTHER_PERMIT_COLOR,
  };
  const permitSizeScale = (() => {
    const v = styleOverrides?.permitSizeScale;
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return 1;
    return Math.max(0.2, Math.min(v, 6));
  })();

  // Normal mode expressions
  const fillColor = buildFillColorExpr(activeCodes, resolvedZoneColors);
  const hoverColor = buildHoverColorExpr(activeCodes, resolvedZoneColors);
  const visibilityFilter = buildVisibilityFilter(activeCodes);

  // Build mode expressions
  const buildFillColor = inBuildMode ? buildModeFillColor(activeBuild!, resolvedBuildColors) : null;
  const buildHoverColor = inBuildMode ? buildModeHoverColor(activeBuild!, resolvedBuildColors) : null;
  const showAllFilter = ["has", "zoning_code"] as unknown as FilterSpecification;
  const hachureCodes = inBuildMode
    ? Array.from(new Set([...(activeBuild!.notAllowedCodes ?? []), ...(activeBuild!.hatchedCodes ?? [])]))
    : [];
  const hachureFilter = inBuildMode && hachureCodes.length > 0
    ? (["in", ["get", "zoning_code"], ["literal", hachureCodes]] as unknown as FilterSpecification)
    : (["==", ["get", "OBJECTID"], -1] as unknown as FilterSpecification);
  const provisionalLegendLabel =
    inBuildMode && activeBuild!.id === "fourplex"
      ? "Provisional; ground-floor restrictions"
      : "Provisional; restrictions apply";
  const showProvisionalLegend = inBuildMode && (activeBuild!.provisionalCodes?.length ?? 0) > 0;
  const showZoningLegend = !inBuildMode && !showPermits;
  const showAnyLegend = inBuildMode || showPermits || showZoningLegend;

  useEffect(() => {
    if (!showAnyLegend) setMobileLegendOpen(false);
  }, [showAnyLegend]);

  function toggleLegendPanel() {
    setMobileLegendOpen((open) => {
      const next = !open;
      if (next) setAttributionOpen(false);
      return next;
    });
  }

  function toggleAttributionPanel() {
    setAttributionOpen((open) => {
      const next = !open;
      if (next) setMobileLegendOpen(false);
      return next;
    });
  }

  // Active fill color (normal vs build)
  const activeFillBase = inBuildMode ? buildFillColor! : fillColor;
  const activeHoverBase = inBuildMode ? buildHoverColor! : hoverColor;
  const activeFilter = inBuildMode ? showAllFilter : visibilityFilter;

  const fillColorExpr: DataDrivenPropertyValueSpecification<string> = [
    "case",
    ["==", ["get", "OBJECTID"], hoveredId ?? -1], activeHoverBase as unknown as string,
    activeFillBase as unknown as string,
  ] as unknown as DataDrivenPropertyValueSpecification<string>;

  const opacityExpr: ExpressionSpecification = [
    "case",
    ["==", ["get", "OBJECTID"], selectedId ?? -1], 0.9,
    ["==", ["get", "OBJECTID"], hoveredId ?? -1], 0.85,
    inBuildMode ? 0.7 : 0.55,
  ];

  const lineColorExpr: ExpressionSpecification = [
    "case",
    ["==", ["get", "OBJECTID"], selectedId ?? -1], "#1b2b3c",
    ["==", ["get", "OBJECTID"], hoveredId ?? -1], "#374151",
    "#6b7280",
  ];

  const lineWidthExpr: ExpressionSpecification = [
    "case",
    ["==", ["get", "OBJECTID"], selectedId ?? -1], 2.5,
    ["==", ["get", "OBJECTID"], hoveredId ?? -1], 1.5,
    0.5,
  ];
  const permitYearFilter = permitYearRange
    ? ([
        "all",
        [">=", ["to-number", ["get", "year"], 0], permitYearRange.from],
        ["<=", ["to-number", ["get", "year"], 0], permitYearRange.to],
      ] as unknown as FilterSpecification)
    : (["has", "permit_no"] as unknown as FilterSpecification);

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: CHAMPAIGN_CENTER.lng,
          latitude: CHAMPAIGN_CENTER.lat,
          zoom: 12,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={TILE_STYLE}
        attributionControl={false}
        onLoad={handleMapLoad}
        onMouseMove={interactive ? handleMouseMove : undefined}
        onMouseLeave={interactive ? handleMouseLeave : undefined}
        onClick={interactive ? handleClick : undefined}
        dragPan={interactive}
        dragRotate={interactive}
        scrollZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        doubleClickZoom={interactive}
        touchZoomRotate={interactive}
      >
        <Source id="zoning" type="geojson" data={data}>
          <Layer
            id="zoning-fill"
            type="fill"
            filter={activeFilter}
            paint={{
              "fill-color": fillColorExpr,
              "fill-opacity": opacityExpr,
            }}
          />
          {SHOW_BUILD_HACHURE && (
            <Layer
              id="zoning-hachure"
              type="fill"
              filter={hachureFilter}
              paint={{
                "fill-pattern": "hachure",
                "fill-opacity": 0.45,
              } as object}
            />
          )}
          <Layer
            id="zoning-outline"
            type="line"
            filter={activeFilter}
            paint={{
              "line-color": lineColorExpr,
              "line-width": lineWidthExpr,
              "line-opacity": 0.7,
            }}
          />
        </Source>
        {showPermits && (
          <Source id="residential-permits" type="geojson" data={permitsData} generateId>
            {permitRenderMode === "points" && (
              <Layer
                id="residential-permits-circles"
                type="circle"
                filter={permitYearFilter}
                paint={{
                  "circle-color": [
                    "match",
                    ["get", "building_type"],
                    "SF",
                    resolvedPermitColors.sf,
                    "MF",
                    resolvedPermitColors.mf,
                    resolvedPermitColors.other,
                  ],
                  "circle-radius": buildPermitRadiusExpression(hoveredPermitId, permitSizeScale),
                  "circle-stroke-color": "#ffffff",
                  "circle-stroke-width": [
                    "case",
                    ["==", ["id"], hoveredPermitId ?? -1],
                    2,
                    1,
                  ],
                  "circle-opacity": 0.78,
                }}
              />
            )}
            {permitRenderMode === "heatmap" && (
              <Layer
                id="residential-permits-heatmap"
                type="heatmap"
                filter={permitYearFilter}
                paint={{
                  "heatmap-weight": [
                    "interpolate",
                    ["linear"],
                    ["to-number", ["get", "units"], 1],
                    1,
                    0.2,
                    10,
                    0.5,
                    50,
                    0.8,
                    150,
                    1,
                  ],
                  "heatmap-intensity": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    10,
                    0.5,
                    14,
                    0.9,
                  ],
                  "heatmap-color": [
                    "interpolate",
                    ["linear"],
                    ["heatmap-density"],
                    0,
                    "rgba(99,102,241,0)",
                    0.2,
                    "rgba(56,189,248,0.65)",
                    0.45,
                    "rgba(34,197,94,0.75)",
                    0.7,
                    "rgba(250,204,21,0.8)",
                    1,
                    "rgba(239,68,68,0.9)",
                  ],
                  "heatmap-radius": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    10,
                    18,
                    14,
                    28,
                    17,
                    38,
                  ],
                  "heatmap-opacity": 0.85,
                }}
              />
            )}
          </Source>
        )}

        {/* Address search pin */}
        {searchPin && (
          <Marker longitude={searchPin.lng} latitude={searchPin.lat} anchor="bottom">
            <div className="flex flex-col items-center">
              <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-white shadow-lg" />
              <div className="w-0.5 h-3 bg-red-500" />
            </div>
          </Marker>
        )}

      </Map>

      {showOverlayUi && (
      <>
      <div
        className="hidden md:flex absolute right-3 z-20 flex-col items-end gap-2"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="relative">
          <button
            type="button"
            onClick={toggleAttributionPanel}
            className="h-9 px-3 rounded-lg border border-gray-200 bg-white/95 text-gray-700 shadow-lg backdrop-blur-sm inline-flex items-center justify-center gap-1.5 hover:bg-white"
            aria-label="About this data"
            aria-expanded={attributionOpen}
          >
            <Info className="h-4 w-4" />
            <span className="text-xs font-medium">Info</span>
          </button>
          {attributionOpen && <ZoningAbout permitsData={permitsData} className="absolute right-full bottom-0 mr-2" />}
        </div>

        {showAnyLegend && (
          <div className="flex flex-col items-end gap-2">
            {showZoningLegend && (
              <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-100 px-3 py-2.5">
                <div className="text-xs font-semibold text-gray-700 mb-2">Zoning Districts</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {ZONING_DISTRICT_LEGEND.map((item) => (
                    <div key={`desktop-zoning-${item.label}`} className="flex items-center gap-2 text-xs text-gray-600">
                      <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inBuildMode && (
              <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-100 px-3 py-2.5">
                <div className="text-xs font-semibold text-gray-700 mb-2">{activeBuild!.label}</div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <div
                      className="w-4 h-4 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: resolvedBuildColors.allowed }}
                    />
                    <span>Allowed by right</span>
                  </div>
                  {showProvisionalLegend && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <div
                        className="w-4 h-4 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: resolvedBuildColors.provisional }}
                      />
                      <span>{provisionalLegendLabel}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <div
                      className="w-4 h-4 rounded-sm flex-shrink-0 relative overflow-hidden"
                      style={{ backgroundColor: resolvedBuildColors.notAllowed }}
                    >
                      {SHOW_BUILD_HACHURE && (
                        <div
                          className="absolute inset-0"
                          style={{
                            background:
                              "repeating-linear-gradient(-45deg, rgba(90,39,53,0.24), rgba(90,39,53,0.24) 1px, transparent 1px, transparent 6px)",
                          }}
                        />
                      )}
                    </div>
                    <span>Not allowed</span>
                  </div>
                </div>
              </div>
            )}

            {showPermits && (
              <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-100 px-3 py-2.5">
                <div className="text-xs font-semibold text-gray-700 mb-2">Residential Permits 2014-2024</div>
                {permitRenderMode === "points" ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: resolvedPermitColors.sf }} />
                      <span>Single-family (SF)</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: resolvedPermitColors.mf }} />
                      <span>Multifamily (MF)</span>
                    </div>
                    <div className="pt-1 mt-0.5 border-t border-gray-100 text-[11px] text-gray-500">
                      <div className="mb-1">Circle size scales by units per permit</div>
                      <div className="flex items-end gap-3">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="rounded-full bg-gray-500/70 border border-white"
                            style={{
                              width: `${LEGEND_RADIUS_1_UNIT_PX * 2}px`,
                              height: `${LEGEND_RADIUS_1_UNIT_PX * 2}px`,
                            }}
                          />
                          <span>1 unit</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div
                            className="rounded-full bg-gray-500/70 border border-white"
                            style={{
                              width: `${LEGEND_RADIUS_100_UNITS_PX * 2}px`,
                              height: `${LEGEND_RADIUS_100_UNITS_PX * 2}px`,
                            }}
                          />
                          <span>100 units</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-[11px] text-gray-500">Heat intensity weighted by unit count</div>
                    <div
                      className="h-2.5 w-44 rounded"
                      style={{
                        background:
                          "linear-gradient(90deg, rgba(56,189,248,0.65) 0%, rgba(34,197,94,0.75) 35%, rgba(250,204,21,0.8) 65%, rgba(239,68,68,0.9) 100%)",
                      }}
                    />
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>Lower units</span>
                      <span>Higher units</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="md:hidden absolute right-3 z-20"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="relative">
          {mobileLegendOpen && showAnyLegend && (
            <div className="absolute bottom-full right-0 mb-2 w-[min(88vw,22rem)] max-h-[45dvh] overflow-auto bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-100 px-3 py-2.5">
              {showZoningLegend && (
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-2">Zoning Districts</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {ZONING_DISTRICT_LEGEND.map((item) => (
                      <div key={`mobile-zoning-${item.label}`} className="flex items-center gap-2 text-xs text-gray-600">
                        <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {inBuildMode && (
                <div className={showZoningLegend ? "pt-2 mt-2 border-t border-gray-100" : ""}>
                  <div className="text-xs font-semibold text-gray-700 mb-2">{activeBuild!.label}</div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <div
                        className="w-4 h-4 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: resolvedBuildColors.allowed }}
                      />
                      <span>Allowed by right</span>
                    </div>
                    {showProvisionalLegend && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <div
                          className="w-4 h-4 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: resolvedBuildColors.provisional }}
                        />
                        <span>{provisionalLegendLabel}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <div
                        className="w-4 h-4 rounded-sm flex-shrink-0 relative overflow-hidden"
                        style={{ backgroundColor: resolvedBuildColors.notAllowed }}
                      >
                        {SHOW_BUILD_HACHURE && (
                          <div
                            className="absolute inset-0"
                            style={{
                              background:
                                "repeating-linear-gradient(-45deg, rgba(90,39,53,0.24), rgba(90,39,53,0.24) 1px, transparent 1px, transparent 6px)",
                            }}
                          />
                        )}
                      </div>
                      <span>Not allowed</span>
                    </div>
                  </div>
                </div>
              )}
              {showPermits && (
                <div className={inBuildMode || showZoningLegend ? "pt-2 mt-2 border-t border-gray-100" : ""}>
                  <div className="text-xs font-semibold text-gray-700 mb-2">Residential Permits 2014-2024</div>
                  {permitRenderMode === "points" ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: resolvedPermitColors.sf }} />
                        <span>Single-family (SF)</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: resolvedPermitColors.mf }} />
                        <span>Multifamily (MF)</span>
                      </div>
                      <div className="pt-1 mt-0.5 border-t border-gray-100 text-[11px] text-gray-500">
                        <div className="mb-1">Circle size scales by units per permit</div>
                        <div className="flex items-end gap-3">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="rounded-full bg-gray-500/70 border border-white"
                              style={{
                                width: `${LEGEND_RADIUS_1_UNIT_PX * 2}px`,
                                height: `${LEGEND_RADIUS_1_UNIT_PX * 2}px`,
                              }}
                            />
                            <span>1 unit</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div
                              className="rounded-full bg-gray-500/70 border border-white"
                              style={{
                                width: `${LEGEND_RADIUS_100_UNITS_PX * 2}px`,
                                height: `${LEGEND_RADIUS_100_UNITS_PX * 2}px`,
                              }}
                            />
                            <span>100 units</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[11px] text-gray-500">Heat intensity weighted by unit count</div>
                      <div
                        className="h-2.5 w-40 rounded"
                        style={{
                          background:
                            "linear-gradient(90deg, rgba(56,189,248,0.65) 0%, rgba(34,197,94,0.75) 35%, rgba(250,204,21,0.8) 65%, rgba(239,68,68,0.9) 100%)",
                        }}
                      />
                      <div className="flex items-center justify-between text-[11px] text-gray-500">
                        <span>Lower units</span>
                        <span>Higher units</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {attributionOpen && <ZoningAbout permitsData={permitsData} className="absolute bottom-full right-0 mb-2" />}

          <div className="flex items-center justify-end gap-2">
            {showAnyLegend && (
              <button
                onClick={toggleLegendPanel}
                className="min-h-11 px-3 py-2 rounded-lg border border-gray-200 bg-white/95 backdrop-blur-sm text-xs font-medium text-gray-700 shadow-lg"
              >
                {mobileLegendOpen ? "Hide legend" : "Legend"}
              </button>
            )}
            <button
              type="button"
              onClick={toggleAttributionPanel}
              className="min-h-11 px-3 py-2 rounded-lg border border-gray-200 bg-white/95 text-gray-700 shadow-lg backdrop-blur-sm inline-flex items-center justify-center gap-1.5"
              aria-label="About this data"
              aria-expanded={attributionOpen}
            >
              <Info className="h-4 w-4" />
              <span className="text-xs font-medium">Info</span>
            </button>
          </div>
        </div>
      </div>
      </>
      )}

      {showOverlayUi && tooltip && (
        <div
          className="absolute z-10 pointer-events-none bg-white/95 backdrop-blur-sm shadow-lg rounded-lg px-3 py-2 text-sm border border-gray-100"
          style={{ left: tooltip.x + 12, top: tooltip.y - 48 }}
        >
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-gray-900">{tooltip.code}</span>
            {tooltip.districtLabel && (
              <span className="text-xs text-gray-400">{tooltip.districtLabel}</span>
            )}
            {tooltip.buildStatus === "allowed" && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">Allowed</span>
            )}
            {tooltip.buildStatus === "provisional" && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800">Provisional</span>
            )}
            {tooltip.buildStatus === "notAllowed" && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800">Not Allowed</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{tooltip.description}</div>
        </div>
      )}
    </div>
  );
}
