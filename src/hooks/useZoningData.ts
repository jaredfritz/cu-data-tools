"use client";

import { useEffect, useState } from "react";

function normalizeZoningCodes(data: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  for (const feature of data.features) {
    const props = feature.properties as Record<string, unknown> | null;
    if (!props) continue;
    if (props.zoning_code === "MHP") props.zoning_code = "MHC";
    if (props.zoning_description === "MHP") props.zoning_description = "MHC";
  }
  return data;
}

export function useZoningData(): GeoJSON.FeatureCollection | null {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    fetch("/data/zoning.geojson")
      .then((r) => r.json())
      .then((d) => setData(normalizeZoningCodes(d)));
  }, []);
  return data;
}
