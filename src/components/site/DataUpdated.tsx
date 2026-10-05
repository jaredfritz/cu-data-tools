import { AboutDataLink } from "@/components/site/AboutThisData";
import { DATA_STATUS, type Dataset } from "@/lib/dataUpdates";

/**
 * A small, muted line saying what a page's data covers and when it was last refreshed, with a link to
 * the page's "About this data" notes.
 */
export function DataUpdated({ dataset, className = "" }: { dataset: Dataset; className?: string }) {
  return (
    <p className={`text-xs text-slate-500 ${className}`}>
      {DATA_STATUS[dataset]} · <AboutDataLink />
    </p>
  );
}
