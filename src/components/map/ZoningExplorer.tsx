import ZoningClient from "@/components/ZoningClient";

interface ZoningExplorerProps {
  permitsData: GeoJSON.FeatureCollection;
  className?: string;
}

export default function ZoningExplorer({ permitsData, className }: ZoningExplorerProps) {
  return (
    <div className={className}>
      <ZoningClient permitsData={permitsData} />
    </div>
  );
}
