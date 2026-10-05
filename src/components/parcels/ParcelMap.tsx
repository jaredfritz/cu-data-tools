"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { ChevronDown } from "lucide-react";
import type { Parcel, ParcelRanks, Parcels } from "@/lib/parcels";
import { boundsOfParcel } from "@/lib/parcels";
import {
  BASEMAP_ATTRIBUTION,
  areaFilter,
  colorExpression,
  CU_VIEW_STATE,
  FARM_COLOR,
  FARM_LABEL,
  heightExpression,
  legendGradient,
  legendPositions,
  MAX_ZOOM,
  metricConfig,
  MIN_ZOOM,
  NO_DATA_PATTERN,
  NO_DATA_SWATCH,
  noDataHatchImage,
  PARCEL_BASEMAP,
  stopsFor,
  VIEW_3D,
  type ColorScale,
  type ParcelMetric,
} from "@/lib/parcelMapStyles";
import { formatMoney } from "@/lib/parcels";
import { ParcelPopup } from "./ParcelPopup";
import { PARCEL_POPUP_CLASS, useParcelSelection } from "./shared";

interface ParcelMapProps {
  data: Parcels;
  metric: ParcelMetric;
  scale: ColorScale;
  /** Area average of the metric (per taxable acre), used by the "vs. area average" scale */
  average: number | null;
  cities: string[] | null;
  bounds: [number, number, number, number] | null;
  is3D: boolean;
  /** A parcel picked from search: the map flies to it and opens its popup. `key` lets a repeat pick refire. */
  focus: { parcel: Parcel; key: number } | null;
  rankFor: (parcel: Parcel) => ParcelRanks | null;
  areaName: string;
}

const THREE_D_ZOOM_BOOST = 0.9;

const INTERACTIVE_LAYERS = ["parcels-fill", "parcels-extrusion", "parcels-no-data"];

export function ParcelMap({ data, metric, scale, average, cities, bounds, is3D, focus, rankFor, areaName }: ParcelMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);

  // Start with the legend collapsed on phones, where it would cover much of the map.
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setLegendOpen(false);
  }, []);
  const { selected, setSelected, handleClick } = useParcelSelection(data);
  const config = metricConfig(metric);
  const filter = useMemo(() => areaFilter(cities), [cities]);
  const stops = useMemo(() => stopsFor(config, scale, average), [config, scale, average]);
  const isAverageScale = stops !== config.stops;
  const color = useMemo(() => colorExpression(config, stops), [config, stops]);
  const positions = useMemo(() => legendPositions(stops), [stops]);
  const hasValue = ["has", config.field];
  const valueFilter = ["all", filter, hasValue];
  const noDataFilter = ["all", filter, ["!", hasValue]];
  const height = useMemo(() => heightExpression(config), [config]);

  // Camera moves are ignored until the map has loaded, so wait for it before fitting the area.
  useEffect(() => {
    if (!loaded || !bounds) return;
    const map = mapRef.current;
    if (!map) return;
    const camera = map.cameraForBounds(bounds, { padding: 40, maxZoom: 15 });
    if (!camera) return;
    // A tilted view makes a fitted area look small and far away, so move in closer in 3D.
    const zoom = (camera.zoom ?? CU_VIEW_STATE.zoom) + (is3D ? THREE_D_ZOOM_BOOST : 0);
    map.easeTo({ ...camera, zoom, ...(is3D ? VIEW_3D : { pitch: 0, bearing: 0 }), duration: 800 });
    // Only refit when the area changes, not when toggling 3D.
  }, [loaded, bounds]);

  // The area fit above already applies the 3D tilt on load; only animate later toggles, since an
  // easeTo would cancel that fit.
  const appliedIs3D = useRef(is3D);
  useEffect(() => {
    if (!loaded || appliedIs3D.current === is3D) return;
    appliedIs3D.current = is3D;
    mapRef.current?.easeTo(is3D ? VIEW_3D : { pitch: 0, bearing: 0 }, { duration: 800 });
  }, [loaded, is3D]);

  useEffect(() => {
    if (!loaded || !focus) return;
    const box = boundsOfParcel(data, focus.parcel);
    mapRef.current?.fitBounds(box, { padding: 120, maxZoom: 17, duration: 900 });
    setSelected({ parcel: focus.parcel, lngLat: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] });
  }, [loaded, focus, data, setSelected]);

  const selectedFilter = ["==", ["get", "i"], selected?.parcel.index ?? -1];

  return (
    <div className="relative">
      <Map
        ref={mapRef}
        initialViewState={CU_VIEW_STATE}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxPitch={70}
        style={{ width: "100%", height: "640px", borderRadius: "4px" }}
        mapStyle={PARCEL_BASEMAP}
        attributionControl={BASEMAP_ATTRIBUTION}
        interactiveLayerIds={INTERACTIVE_LAYERS}
        onClick={handleClick}
        onLoad={(event) => {
          if (!event.target.hasImage(NO_DATA_PATTERN)) event.target.addImage(NO_DATA_PATTERN, noDataHatchImage());
          setLoaded(true);
        }}
        cursor="pointer"
      >
        <NavigationControl position="top-right" visualizePitch />
        <Source id="parcels" type="geojson" data={data.geojson} tolerance={0.25}>
          {/* Added after load (it needs the hatch image), so pin it below the parcel layers;
              otherwise MapLibre appends it on top and it draws over the 3D extrusions. */}
          {loaded && (
            <Layer
              id="parcels-no-data"
              type="fill"
              beforeId="parcels-fill"
              filter={noDataFilter as never}
              paint={{ "fill-pattern": NO_DATA_PATTERN, "fill-opacity": 0.8 }}
            />
          )}
          <Layer
            id="parcels-fill"
            type="fill"
            filter={valueFilter as never}
            layout={{ visibility: is3D ? "none" : "visible" }}
            paint={{ "fill-color": color as never, "fill-opacity": 0.85 }}
          />
          <Layer
            id="parcels-outline"
            type="line"
            filter={filter as never}
            minzoom={14}
            layout={{ visibility: is3D ? "none" : "visible" }}
            paint={{ "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.2, 17, 1] }}
          />
          <Layer
            id="parcels-extrusion"
            type="fill-extrusion"
            filter={valueFilter as never}
            layout={{ visibility: is3D ? "visible" : "none" }}
            paint={{
              "fill-extrusion-color": color as never,
              "fill-extrusion-height": height as never,
              "fill-extrusion-opacity": 0.9,
            }}
          />
          <Layer
            id="parcels-selected"
            type="line"
            filter={selectedFilter as never}
            paint={{ "line-color": "#002147", "line-width": 3 }}
          />
        </Source>
        {selected && (
          <Popup
            longitude={selected.lngLat[0]}
            latitude={selected.lngLat[1]}
            onClose={() => setSelected(null)}
            closeOnClick={false}
            className={PARCEL_POPUP_CLASS}
            maxWidth="300px"
            offset={8}
          >
            <ParcelPopup
              parcel={selected.parcel}
              taxYear={data.meta.taxYear}
              ranks={rankFor(selected.parcel)}
              areaName={areaName}
            />
          </Popup>
        )}
      </Map>

      <div className="absolute bottom-8 left-3 max-w-[220px] rounded-[4px] bg-white/90 shadow-md backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setLegendOpen((open) => !open)}
          aria-expanded={legendOpen}
          aria-controls="parcel-legend"
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        >
          <span className="text-xs font-semibold">{legendOpen ? config.label : "Legend"}</span>
          <ChevronDown
            aria-hidden
            className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${legendOpen ? "" : "rotate-180"}`}
          />
          <span className="sr-only">{legendOpen ? "Hide legend" : "Show legend"}</span>
        </button>
        {legendOpen && (
          <div id="parcel-legend" className="px-3 pb-3">
            {isAverageScale && average !== null && (
              <p className="-mt-1 text-[11px] text-slate-500">Area average, excluding farmland: {formatMoney(average, { compact: true })}</p>
            )}
            <div className="mt-2 flex gap-2">
              <span
                className="w-3 shrink-0 rounded-[2px]"
                style={{ height: 150, background: legendGradient(stops, positions) }}
                aria-hidden
              />
              <div className="relative w-full" style={{ height: 150 }}>
                {stops.map((stop, index) =>
                  stop.label ? (
                    <span
                      key={stop.label}
                      className="absolute left-0 -translate-y-1/2 whitespace-nowrap text-[11px] leading-none text-slate-700"
                      style={{ top: `${(1 - positions[index]) * 100}%` }}
                    >
                      {stop.label}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-3 w-4 shrink-0 rounded-[2px]" style={{ background: NO_DATA_SWATCH }} />
                <span className="text-xs text-slate-700">{config.noDataLabel}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-4 shrink-0 rounded-[2px]" style={{ backgroundColor: FARM_COLOR }} />
                <span className="text-xs text-slate-700">{FARM_LABEL}</span>
              </div>
            </div>
            {is3D && (
              <p className="mt-2 border-t border-slate-200 pt-1.5 text-[11px] text-slate-500">
                Height = value per acre
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
