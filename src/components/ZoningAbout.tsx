import { OpenSourceNote } from "@/components/site/AboutThisData";
import { DATA_STATUS, permitsThrough } from "@/lib/dataUpdates";

const linkClass = "underline hover:text-gray-800";

/** Sources, methods, and caveats for the zoning explorer, opened from its Info button. */
export default function ZoningAbout({
  permitsData,
  className = "",
}: {
  permitsData: GeoJSON.FeatureCollection;
  className?: string;
}) {
  const years = permitsData.features.map((feature) => Number(feature.properties?.year)).filter(Boolean);
  const meta = (permitsData as GeoJSON.FeatureCollection & { meta?: { permits: number; placed: number } }).meta;
  const unplaced = meta ? meta.permits - meta.placed : 0;

  return (
    <div
      className={`w-80 max-w-[calc(100vw-1.5rem)] max-h-[60vh] overflow-y-auto rounded-lg border border-gray-100 bg-white/95 px-3 py-2.5 text-[11px] leading-relaxed text-gray-600 shadow-lg backdrop-blur-sm ${className}`}
    >
      <p className="text-xs font-semibold text-gray-800">About this data</p>
      <p className="text-gray-500">
        {DATA_STATUS.zoning} · {permitsThrough(permitsData)}
      </p>
      <p className="mt-2">
        <strong>Zoning districts</strong> are the City of Champaign&apos;s{" "}
        <a
          href="https://gis-cityofchampaign.opendata.arcgis.com/datasets/a24e403a9fa245dbaaaf46f766860c40_15/explore"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          Zoning Classifications
        </a>{" "}
        layer. Where this map differs from the official zoning map or the{" "}
        <a
          href="https://library.municode.com/il/champaign/codes/code_of_ordinances?nodeId=MUCO_CH37ZO"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          Zoning Ordinance (Chapter 37)
        </a>
        , the official versions govern.
      </p>
      <p className="mt-2">
        <strong>Where can I build</strong> is our reading of what Chapter 37 allows in each district. It isn&apos;t
        legal advice or a zoning determination: lot size, setbacks, overlays, planned developments, and other rules can
        change what&apos;s allowed on a specific lot. Check with the city&apos;s Planning and Development Department
        before you build.
      </p>
      <p className="mt-2">
        <strong>Residential permits</strong> are new-construction building permits provided by the City of Champaign
        {years.length > 0 && (
          <>
            {" "}
            ({Math.min(...years)}–{Math.max(...years)})
          </>
        )}
        . Each is mapped at its address in the city&apos;s address points. A few the city has no point for are placed
        inside the matching county parcel or between the neighboring addresses on the same side of the street.
        {unplaced > 0 && ` ${unplaced} permits whose addresses couldn't be matched aren't shown.`}
      </p>
      <p className="mt-2">
        <OpenSourceNote linkClassName={linkClass} />
      </p>
      <p className="mt-2 text-gray-500">
        Map:{" "}
        <a href="https://maplibre.org/" target="_blank" rel="noreferrer" className={linkClass}>
          MapLibre
        </a>{" "}
        · &copy;{" "}
        <a href="https://carto.com/attributions" target="_blank" rel="noreferrer" className={linkClass}>
          CARTO
        </a>
        , &copy;{" "}
        <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer" className={linkClass}>
          OpenMapTiles
        </a>
        , &copy;{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className={linkClass}>
          OpenStreetMap contributors
        </a>
      </p>
    </div>
  );
}
