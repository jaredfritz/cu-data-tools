"use client";

import { useMemo } from "react";
import Map, { Layer, Source, ViewState } from "react-map-gl/maplibre";
import type { DataDrivenPropertyValueSpecification, FilterSpecification } from "maplibre-gl";
import { ZONE_COLOR_MAP } from "@/lib/zoning";
import { useZoningData } from "@/hooks/useZoningData";

const TILE_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

function buildFillColorExpr(): DataDrivenPropertyValueSpecification<string> {
  const arms: string[] = [];
  for (const [code, color] of Object.entries(ZONE_COLOR_MAP)) {
    arms.push(code, color);
  }
  return ["match", ["get", "zoning_code"], ...arms, "#d2d8df"] as unknown as DataDrivenPropertyValueSpecification<string>;
}

interface HomeZoningPreviewProps {
  interactive?: boolean;
  initialViewState?: Partial<ViewState>;
  className?: string;
}

export default function HomeZoningPreview({
  interactive = false,
  initialViewState,
  className,
}: HomeZoningPreviewProps) {
  const data = useZoningData();
  const fillColorExpr = useMemo(() => buildFillColorExpr(), []);
  const visibleFilter = ["has", "zoning_code"] as unknown as FilterSpecification;

  return (
    <div className={className}>
      <Map
        initialViewState={{
          longitude: -88.2434,
          latitude: 40.1164,
          zoom: 11.7,
          ...initialViewState,
        }}
        mapStyle={TILE_STYLE}
        style={{ width: "100%", height: "100%" }}
        interactive={interactive}
        attributionControl={false}
        dragRotate={false}
        touchZoomRotate={false}
      >
        {data && (
          <Source id="zoning-home" type="geojson" data={data}>
            <Layer
              id="zoning-home-fill"
              type="fill"
              filter={visibleFilter}
              paint={{
                "fill-color": fillColorExpr,
                "fill-opacity": 0.55,
              }}
            />
            <Layer
              id="zoning-home-outline"
              type="line"
              filter={visibleFilter}
              paint={{
                "line-color": "#45556c",
                "line-width": 0.6,
                "line-opacity": 0.55,
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}
