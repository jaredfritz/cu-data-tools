// What each dataset behind the /data maps covers and when it was last refreshed. The data scripts
// keep their entries current (scripts/fetch-parcel-values.mjs, scripts/fetch-idot-crashes.mjs);
// zoning is a static file, so its date is set by hand when the file changes.
import updates from "@/data/data-updates.json";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Oct 5, 2026", formatted by hand so the server and browser always render the same text
 * (locale formatting can differ between Node and browsers and break hydration).
 */
export function formatUpdateDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function formatMonth(isoDate: string): string {
  const [year, month] = isoDate.slice(0, 7).split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

/** One line per dataset: what the data covers, then when we last pulled new data. */
export const DATA_STATUS = {
  crashes: `Crashes through ${formatUpdateDate(updates.crashes.through)} · Refreshed ${formatUpdateDate(updates.crashes.refreshed)}`,
  parcels: `${updates.parcels.assessmentYear} assessments · Refreshed ${formatUpdateDate(updates.parcels.refreshed)}`,
  zoning: `Zoning as of ${formatMonth(updates.zoning.asOf)}`,
};

export type Dataset = keyof typeof DATA_STATUS;

/** "Permits through 2024", from the latest permit year in the data. */
export function permitsThrough(permits: GeoJSON.FeatureCollection): string {
  const latest = permits.features.reduce((max, feature) => Math.max(max, Number(feature.properties?.year) || 0), 0);
  return `Permits through ${latest}`;
}
