import HomeZoningPreview from "@/components/map/HomeZoningPreview";
import ZoningExplorer from "@/components/map/ZoningExplorer";
import type { ViewState } from "react-map-gl/maplibre";

export interface MapEmbedProps {
  mode: "home" | "full";
  interactive: boolean;
  initialViewState?: Partial<ViewState>;
  className?: string;
  permitsData?: GeoJSON.FeatureCollection;
}

export default function MapEmbed({
  mode,
  interactive,
  initialViewState,
  className,
  permitsData,
}: MapEmbedProps) {
  if (mode === "full") {
    if (!permitsData) {
      throw new Error("MapEmbed full mode requires permitsData.");
    }
    return <ZoningExplorer permitsData={permitsData} className={className} />;
  }

  return (
    <HomeZoningPreview
      interactive={interactive}
      initialViewState={initialViewState}
      className={className}
    />
  );
}
