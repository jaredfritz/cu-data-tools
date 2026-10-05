"use client";

import { useCallback, useMemo, useState } from "react";
import Map, { Layer, NavigationControl, Popup, Source, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Crash } from "@/lib/crashes";
import { toGeoJSON } from "@/lib/crashes";
import { BASEMAP_ATTRIBUTION, CRASH_BASEMAP, CU_VIEW_STATE, MAP_METRICS, MAX_ZOOM, MIN_ZOOM, type MapMetric } from "@/lib/crashMapStyles";
import { CrashPopup } from "./shared";

export function CrashMap({ crashes }: { crashes: Crash[] }) {
  const [selected, setSelected] = useState<Crash | null>(null);
  const [metric, setMetric] = useState<MapMetric>("severity");
  const config = MAP_METRICS.find((m) => m.id === metric) ?? MAP_METRICS[0];
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = useMemo(
    () => new Set(config.legend.map((item) => item.label).filter((label) => !hidden.has(label))),
    [config, hidden],
  );

  const geojson = useMemo(() => toGeoJSON(crashes), [crashes]);

  const toggleCategory = (label: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const index = event.features?.[0]?.properties?.index;
      setSelected(typeof index === "number" ? crashes[index] : null);
    },
    [crashes],
  );

  return (
    <div className="relative">
      <Map
        initialViewState={CU_VIEW_STATE}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        style={{ width: "100%", height: "600px", borderRadius: "4px" }}
        mapStyle={CRASH_BASEMAP}
        attributionControl={BASEMAP_ATTRIBUTION}
        interactiveLayerIds={["crashes-circle"]}
        onClick={handleClick}
        cursor="pointer"
      >
        <NavigationControl position="top-right" />
        <Source id="crashes" type="geojson" data={geojson}>
          <Layer
            id="crashes-circle"
            type="circle"
            filter={config.getFilterExpression(visible) as never}
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 14, 5, 17, 7],
              "circle-color": config.colorExpression as never,
              "circle-opacity": 0.75,
              "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 0, 13, 1],
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

      <div className="absolute right-12 top-3 rounded-[4px] bg-white/90 shadow-md backdrop-blur-sm">
        <label className="sr-only" htmlFor="crash-map-metric">
          Color crashes by
        </label>
        <select
          id="crash-map-metric"
          value={metric}
          onChange={(event) => {
            setMetric(event.target.value as MapMetric);
            setHidden(new Set());
          }}
          className="cursor-pointer rounded-[4px] border-0 bg-transparent px-3 py-2 text-sm font-medium"
        >
          {MAP_METRICS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="absolute bottom-8 left-3 rounded-[4px] bg-white/90 p-3 shadow-md backdrop-blur-sm">
        <p className="mb-1.5 border-b border-slate-200 pb-1.5 text-[11px] text-slate-500">
          {geojson.features.length.toLocaleString()} crashes mapped
        </p>
        <p className="mb-2 text-xs font-semibold">{config.label}</p>
        <div className="space-y-1">
          {config.legend.map((item) => {
            const isVisible = visible.has(item.label);
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => toggleCategory(item.label)}
                aria-pressed={isVisible}
                className={`flex w-full items-center gap-2 text-left transition-opacity ${isVisible ? "" : "opacity-40"}`}
              >
                <span
                  className="h-3 w-3 rounded-full border-2"
                  style={{ backgroundColor: isVisible ? item.color : "transparent", borderColor: item.color }}
                />
                <span className="text-xs text-slate-700">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
