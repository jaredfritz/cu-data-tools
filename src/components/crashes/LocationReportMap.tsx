"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { bbox } from "@turf/turf";
import type { Crash, DateRange, LocationReport } from "@/lib/crashes";
import { formatCurrency, formatDateRange, toGeoJSON } from "@/lib/crashes";
import {
  BASEMAP_ATTRIBUTION,
  CRASH_BASEMAP,
  CU_VIEW_STATE,
  MAX_ZOOM,
  MIN_ZOOM,
  SEVERITY_COLOR_EXPRESSION,
  SEVERITY_LEGEND,
} from "@/lib/crashMapStyles";
import { CrashPopup } from "./shared";

export type SelectionMode = "radius" | "polygon" | "place";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface LocationReportMapProps {
  mode: SelectionMode;
  selectionArea: GeoJSON.Feature | null;
  selectedCenter: [number, number] | null;
  onCenterSelect: (center: [number, number]) => void;
  onPolygonComplete: (polygon: [number, number][]) => void;
  /** Increments when the radius center is set from an address search, so the map zooms to it. */
  centerFocusKey: number;
  report: LocationReport | null;
  reportRange: DateRange | null;
}

export function LocationReportMap({
  mode,
  selectionArea,
  selectedCenter,
  onCenterSelect,
  onPolygonComplete,
  centerFocusKey,
  report,
  reportRange,
}: LocationReportMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [drawing, setDrawing] = useState<[number, number][]>([]);
  const [selected, setSelected] = useState<Crash | null>(null);

  useEffect(() => {
    setDrawing([]);
  }, [mode]);

  useEffect(() => {
    setSelected(null);
  }, [report]);

  const crashes = useMemo(() => (report ? toGeoJSON(report.crashes) : EMPTY), [report]);

  const selectionAreaRef = useRef(selectionArea);
  selectionAreaRef.current = selectionArea;

  // Zoom to the radius circle when its center comes from an address search (map clicks don't move the map).
  useEffect(() => {
    const map = mapRef.current;
    const area = selectionAreaRef.current;
    if (!map || centerFocusKey === 0 || !area) return;
    const [minX, minY, maxX, maxY] = bbox(area);
    map.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 60, duration: 1000, maxZoom: 17 },
    );
  }, [centerFocusKey]);

  // When a radius or polygon report is generated, fit the map to the area, leaving room for the stats panel.
  useEffect(() => {
    const map = mapRef.current;
    const area = selectionAreaRef.current;
    if (!map || !report || mode === "place" || !area) return;
    const [minX, minY, maxX, maxY] = bbox(area);
    map.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      {
        padding: { top: 40, bottom: 40, right: 50, left: window.innerWidth >= 640 ? 250 : 40 },
        duration: 1000,
        maxZoom: 18,
      },
    );
  }, [report, mode]);

  // Zoom to a place when it is picked from the dropdown, or to the report's crashes when it has no boundary.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== "place") return;
    const target = selectionArea ?? (crashes.features.length ? crashes : null);
    if (!target) return;
    const [minX, minY, maxX, maxY] = bbox(target);
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return;
    map.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      // Leave room on the left for the stats panel, which is hidden on phones.
      {
        padding: { top: 40, bottom: 40, right: 50, left: window.innerWidth >= 640 ? 250 : 40 },
        duration: 1000,
        maxZoom: 15,
      },
    );
  }, [mode, selectionArea, crashes]);

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const index = event.features?.[0]?.properties?.index;
      if (report && typeof index === "number") {
        setSelected(report.crashes[index]);
        return;
      }
      const point: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      if (mode === "radius") onCenterSelect(point);
      else if (mode === "polygon") setDrawing((prev) => [...prev, point]);
    },
    [mode, onCenterSelect, report],
  );

  const handleDblClick = useCallback(
    (event: MapLayerMouseEvent) => {
      if (mode !== "polygon" || drawing.length < 3) return;
      event.preventDefault();
      onPolygonComplete(drawing);
      setDrawing([]);
    },
    [mode, drawing, onPolygonComplete],
  );

  const drawingPreview: GeoJSON.Feature | null =
    drawing.length < 2
      ? null
      : drawing.length === 2
        ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: drawing } }
        : { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...drawing, drawing[0]]] } };

  const stats = report?.stats;
  const sideMetrics = stats
    ? [
        ["Fatalities", stats.totalFatalities],
        ["Incapacitating", stats.incapacitatingInjuries],
        ["Total Injuries", stats.totalInjuries],
        ["Pedestrian", stats.pedestrianCrashes],
        ["Bicycle", stats.bicycleCrashes],
        ["Hit & Run", stats.hitAndRunCount],
        ["Heavy Vehicle", stats.heavyVehicleCrashes],
        ["With Injuries", stats.crashesWithInjuries],
      ].filter(([, value]) => Number(value) > 0)
    : [];

  return (
    <div className="relative">
      <Map
        ref={mapRef}
        initialViewState={CU_VIEW_STATE}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        style={{ width: "100%", height: "600px", borderRadius: "4px" }}
        mapStyle={CRASH_BASEMAP}
        attributionControl={BASEMAP_ATTRIBUTION}
        interactiveLayerIds={report ? ["report-crashes"] : []}
        onClick={handleClick}
        onDblClick={handleDblClick}
        doubleClickZoom={mode !== "polygon"}
        cursor={mode === "place" ? "grab" : "crosshair"}
      >
        <NavigationControl position="top-right" />

        <Source id="selection-area" type="geojson" data={selectionArea ?? EMPTY}>
          <Layer id="selection-area-fill" type="fill" paint={{ "fill-color": "#0047ab", "fill-opacity": 0.12 }} />
          <Layer
            id="selection-area-outline"
            type="line"
            paint={{ "line-color": "#0047ab", "line-width": 2, "line-dasharray": [2, 2] }}
          />
        </Source>

        {mode === "polygon" && drawingPreview && (
          <Source id="drawing-preview" type="geojson" data={drawingPreview}>
            <Layer id="drawing-preview-fill" type="fill" paint={{ "fill-color": "#0047ab", "fill-opacity": 0.1 }} />
            <Layer id="drawing-preview-line" type="line" paint={{ "line-color": "#0047ab", "line-width": 2 }} />
          </Source>
        )}

        {mode === "polygon" &&
          drawing.map((point, index) => (
            <Marker key={index} longitude={point[0]} latitude={point[1]} anchor="center">
              <div className="h-3 w-3 rounded-full border-2 border-white bg-[var(--color-accent-secondary)] shadow-md" />
            </Marker>
          ))}

        {mode === "radius" && selectedCenter && (
          <Marker longitude={selectedCenter[0]} latitude={selectedCenter[1]} anchor="center">
            <div className="h-4 w-4 rounded-full border-2 border-white bg-[var(--color-accent-secondary)] shadow-lg" />
          </Marker>
        )}

        <Source id="report-crashes-src" type="geojson" data={crashes}>
          <Layer
            id="report-crashes"
            type="circle"
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 14, 5, 17, 7],
              "circle-color": SEVERITY_COLOR_EXPRESSION as never,
              "circle-opacity": 0.8,
              "circle-stroke-width": 1,
              "circle-stroke-color": "#ffffff",
            }}
          />
        </Source>

        {selected && selected.lon !== null && selected.lat !== null && (
          <Popup
            longitude={selected.lon}
            latitude={selected.lat}
            onClose={() => setSelected(null)}
            closeOnClick={false}
            offset={10}
          >
            <CrashPopup crash={selected} />
          </Popup>
        )}
      </Map>

      {report && stats && reportRange && (
        <div className="absolute left-3 top-3 hidden max-w-[220px] rounded-[4px] bg-white/95 p-4 shadow-lg backdrop-blur-sm sm:block">
          <div className="mb-3 border-b border-slate-200 pb-2 text-xs text-slate-500">{formatDateRange(reportRange)}</div>
          <div className="mb-3">
            <div className="text-3xl font-bold">{stats.totalCrashes.toLocaleString()}</div>
            <div className="text-xs text-slate-500">Total Crashes</div>
          </div>
          <div className="mb-2 space-y-1 border-b border-slate-200 pb-2">
            <SideCost value={report.costs.totalEconomic} label="Est. Economic Cost" />
            <SideCost value={report.costs.totalSocietal} label="Est. Total Societal Cost" />
          </div>
          <div className="space-y-1">
            {sideMetrics.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-slate-600">{label}</span>
                <span className="text-lg font-bold">{Number(value).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-slate-200 pt-1.5">
            <p className="mb-1 text-xs font-semibold">Severity</p>
            <div className="space-y-1">
              {SEVERITY_LEGEND.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-slate-600">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {mode === "polygon" && drawing.length > 0 && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-[4px] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white shadow-md">
          {drawing.length < 3
            ? `Click to add vertices (${3 - drawing.length} more needed)`
            : "Double-click to complete polygon"}
        </div>
      )}
    </div>
  );
}

function SideCost({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-[4px] bg-slate-50 px-2 py-0.5">
      <div className="text-base font-bold leading-tight">{formatCurrency(value)}</div>
      <div className="text-[10px] text-slate-600">{label}</div>
    </div>
  );
}
