"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { booleanPointInPolygon, circle, point } from "@turf/turf";
import AddressSearch from "@/components/AddressSearch";
import type { Crash, Crashes, DateRange, LocationReport as Report } from "@/lib/crashes";
import {
  ALL_PLACES,
  ccrpcNote,
  ccrpcRange,
  datePresets,
  inDateRange,
  loadCrashes,
  loadPlaceBoundaries,
  locationReport,
  matchesPlace,
  placeLabel,
  rangeForPlace,
  toCsv,
  UNIVERSITY_DISTRICT,
} from "@/lib/crashes";
import { CausesTable } from "./CausesTable";
import { LocationReportMap, type SelectionMode } from "./LocationReportMap";
import { ReportStats } from "./ReportStats";
import { TrendSparklines } from "./TrendSparklines";
import {
  cardClass,
  CrashPageHeader,
  DataSourceNote,
  DateRangeControls,
  ErrorBlock,
  LoadingBlock,
  placeOptions,
} from "./shared";

const MIN_RADIUS = 25;
const MAX_RADIUS = 10560; // 2 miles
const FEET_PER_KM = 3280.84;
const DEFAULT_PLACE = ALL_PLACES;

// Logarithmic slider so small radii around an intersection are easy to pick.
function sliderToRadius(value: number): number {
  const minLog = Math.log(MIN_RADIUS);
  const scale = (Math.log(MAX_RADIUS) - minLog) / 100;
  return Math.round(Math.exp(minLog + scale * value));
}

function radiusToSlider(radius: number): number {
  const minLog = Math.log(MIN_RADIUS);
  const scale = (Math.log(MAX_RADIUS) - minLog) / 100;
  return (Math.log(radius) - minLog) / scale;
}

const modeButton = (active: boolean) =>
  `flex-1 rounded-[4px] px-3 py-2 text-sm font-medium transition-colors ${
    active ? "bg-[var(--color-primary)] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
  }`;

export default function LocationReport() {
  const [data, setData] = useState<Crashes | null>(null);
  const [boundaries, setBoundaries] = useState<GeoJSON.FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<SelectionMode>("place");
  const [range, setRange] = useState<DateRange>({ start: "", end: "" });
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [centerFocusKey, setCenterFocusKey] = useState(0);
  const [radius, setRadius] = useState(200);
  const [polygon, setPolygon] = useState<[number, number][] | null>(null);
  const [place, setPlace] = useState<string>(DEFAULT_PLACE);

  const [report, setReport] = useState<Report | null>(null);
  const [reportRange, setReportRange] = useState<DateRange | null>(null);
  const [reportLabel, setReportLabel] = useState("");
  const autoLoaded = useRef(false);

  useEffect(() => {
    loadCrashes().then(
      (loaded) => {
        setData(loaded);
        setRange(datePresets(loaded.minDate, loaded.maxDate)[0].range);
      },
      (err: Error) => setError(err.message),
    );
    loadPlaceBoundaries().then(setBoundaries);
  }, []);

  const places = useMemo(
    () =>
      data
        ? placeOptions(data).map((option) => ({
            ...option,
            count: data.crashes.filter((crash) => matchesPlace(crash, option.value)).length,
          }))
        : [],
    [data],
  );

  // "All" outlines all three cities together.
  const placeBoundary: GeoJSON.Feature | null = useMemo(() => {
    const features = (boundaries?.features ?? []).filter(
      (feature) => place === ALL_PLACES || feature.properties?.name === place,
    );
    if (features.length === 0) return null;
    if (features.length === 1) return features[0];
    const coordinates = features.flatMap((feature) =>
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.type === "MultiPolygon"
          ? feature.geometry.coordinates
          : [],
    );
    return { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates } };
  }, [boundaries, place]);

  const selectionArea: GeoJSON.Feature | null = useMemo(() => {
    if (mode === "radius" && center) return circle(center, radius / FEET_PER_KM, { steps: 64, units: "kilometers" });
    if (mode === "polygon" && polygon) {
      return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...polygon, polygon[0]]] } };
    }
    if (mode === "place") return placeBoundary;
    return null;
  }, [mode, center, radius, polygon, placeBoundary]);

  const hasSelection = (mode === "radius" && !!center) || (mode === "polygon" && !!polygon) || mode === "place";

  const generate = useCallback(() => {
    if (!data) return;
    let matches: (crash: Crash) => boolean;
    let label: string;
    if (mode === "place") {
      matches = (crash) => matchesPlace(crash, place);
      label = placeLabel(place);
    } else if (selectionArea && selectionArea.geometry.type === "Polygon") {
      const area = selectionArea as GeoJSON.Feature<GeoJSON.Polygon>;
      matches = (crash) =>
        crash.lon !== null && crash.lat !== null && booleanPointInPolygon(point([crash.lon, crash.lat]), area);
      label = mode === "radius" ? `${radius.toLocaleString()} ft radius` : "Drawn area";
    } else {
      return;
    }
    // University District data only exists for CCRPC's years, so the report uses those years.
    const reportDates = mode === "place" ? rangeForPlace(data, place, range) : range;
    const crashes = data.crashes.filter((crash) => inDateRange(crash, reportDates) && matches(crash));
    setReport(locationReport(crashes, reportDates));
    setReportRange(reportDates);
    setReportLabel(label);
  }, [data, mode, place, selectionArea, radius, range]);

  // Generate the default report (all three cities, latest year) once data has loaded.
  useEffect(() => {
    if (data && range.start && !autoLoaded.current) {
      autoLoaded.current = true;
      generate();
    }
  }, [data, range, generate]);

  const clearReport = () => {
    setReport(null);
    setReportRange(null);
  };

  const switchMode = (next: SelectionMode) => {
    setMode(next);
    setCenter(null);
    setPolygon(null);
    clearReport();
  };

  const handleExport = () => {
    if (!report) return;
    const blob = new Blob([toCsv(report.crashes)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slug = reportLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    link.href = url;
    link.download = `crashes-${slug}-${reportRange?.start}-to-${reportRange?.end}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const unmapped = report ? report.crashes.filter((crash) => crash.lon === null).length : 0;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <CrashPageHeader
        title="Location Crash Report"
        description="Pick a city, draw an area, or drop a radius around an intersection to get a crash report with estimated costs, causes, and trends."
      />

      {error && <ErrorBlock message={error} />}
      {!data && !error && <LoadingBlock label="Loading crash data..." height="h-40" />}

      {data && (
        <>
          <div className={`${cardClass} mb-8 p-4 sm:p-6`}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="mb-2 block text-sm font-medium text-slate-700">Selection Mode</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => switchMode("radius")} className={modeButton(mode === "radius")}>
                    Radius
                  </button>
                  <button type="button" onClick={() => switchMode("polygon")} className={modeButton(mode === "polygon")}>
                    Polygon
                  </button>
                  <button type="button" onClick={() => switchMode("place")} className={modeButton(mode === "place")}>
                    Place
                  </button>
                </div>
              </div>

              {mode === "radius" && (
                <div>
                  <label htmlFor="crash-radius" className="mb-2 block text-sm font-medium text-slate-700">
                    Radius: <span className="font-bold text-[var(--color-accent-secondary)]">{radius.toLocaleString()} ft</span>
                  </label>
                  <input
                    id="crash-radius"
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={radiusToSlider(radius)}
                    onChange={(event) => setRadius(sliderToRadius(Number(event.target.value)))}
                    className="h-2 w-full cursor-pointer accent-[var(--color-primary)]"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>25 ft</span>
                    <span>2 mi</span>
                  </div>
                </div>
              )}

              {mode === "place" && (
                <div>
                  <label htmlFor="crash-place" className="mb-2 block text-sm font-medium text-slate-700">
                    Place
                  </label>
                  <select
                    id="crash-place"
                    value={place}
                    onChange={(event) => {
                      setPlace(event.target.value);
                      clearReport();
                    }}
                    className="w-full rounded-[4px] border border-[var(--color-border)] bg-white px-2 py-2 text-sm"
                  >
                    {places.map((option) => (
                      <option key={option.value} value={option.value}>
                        {placeLabel(option.value)} ({option.count.toLocaleString()})
                      </option>
                    ))}
                  </select>
                  {place === UNIVERSITY_DISTRICT && (
                    <p className="mt-1 text-xs text-slate-500">
                      From CCRPC&apos;s crash dashboard; only {ccrpcRange(data)?.start.slice(0, 4)}–
                      {ccrpcRange(data)?.end.slice(0, 4)} crashes are tagged.
                    </p>
                  )}
                </div>
              )}

              <div className={mode === "polygon" ? "sm:col-span-2" : ""}>
                <p className="mb-2 block text-sm font-medium text-slate-700">Date Range</p>
                <DateRangeControls data={data} range={range} onChange={setRange} compact />
              </div>

              <div className="flex items-end gap-2">
                {mode !== "place" && (center || polygon) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCenter(null);
                      setPolygon(null);
                      clearReport();
                    }}
                    className="flex-1 rounded-[4px] bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={generate}
                  disabled={!hasSelection}
                  className={`flex-1 rounded-[4px] px-3 py-2 text-sm font-semibold transition-colors ${
                    hasSelection ? "cta-primary hover:opacity-90" : "cursor-not-allowed bg-slate-200 text-slate-500"
                  }`}
                >
                  Generate
                </button>
              </div>
            </div>

            {mode === "radius" && (
              <div className="mt-4 max-w-xl">
                <p className="mb-2 block text-sm font-medium text-slate-700">Center point</p>
                <AddressSearch
                  onResult={(result) => {
                    setCenter([result.lng, result.lat]);
                    setCenterFocusKey((key) => key + 1);
                    clearReport();
                  }}
                  onClear={() => {
                    setCenter(null);
                    clearReport();
                  }}
                />
              </div>
            )}

            <p className="mt-3 text-xs text-slate-500">
              {mode === "radius"
                ? "Search for an address, or click on the map to place a center point."
                : mode === "polygon"
                  ? "Click to draw vertices. Double-click to finish."
                  : "Cities use the municipality IDOT records for each crash. Radius and polygon reports include crashes in Champaign, Urbana, and Savoy only."}
            </p>
          </div>

          <div className={`${cardClass} mb-8 p-6`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">{report ? reportLabel : "Select Area"}</h2>
              {report && (
                <button
                  type="button"
                  onClick={handleExport}
                  className="rounded-[4px] border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  Export crashes (CSV)
                </button>
              )}
            </div>
            <LocationReportMap
              mode={mode}
              selectionArea={selectionArea}
              selectedCenter={center}
              onCenterSelect={(next) => {
                setCenter(next);
                clearReport();
              }}
              onPolygonComplete={(next) => {
                setPolygon(next);
                clearReport();
              }}
              centerFocusKey={centerFocusKey}
              report={report}
              reportRange={reportRange}
            />
            {unmapped > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {unmapped.toLocaleString()} crashes in this report have no coordinates and are counted but not mapped.
              </p>
            )}
          </div>

          {report && (
            <>
              <ReportStats
                report={report}
                heavyNote={reportRange ? ccrpcNote(data, reportRange, report.stats.heavyVehicleKnown) : null}
              />

              <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
                <div className={`${cardClass} p-6`}>
                  <h2 className="mb-4 text-xl font-semibold">Monthly Trends</h2>
                  <TrendSparklines data={report.monthlyTrends} />
                </div>
                <div className={`${cardClass} p-6`}>
                  <h2 className="mb-4 text-xl font-semibold">Primary Crash Causes</h2>
                  <CausesTable causes={report.causes} />
                </div>
              </div>
            </>
          )}

          <DataSourceNote data={data}>
            {report && (
              <>
                <p>
                  <strong>Cost estimates</strong> use the Federal Highway Administration (FHWA) KABCO injury-based
                  methodology. <strong>Economic costs</strong> include medical expenses, lost productivity, legal costs, and
                  property damage. <strong>Societal costs</strong> add the value of lost quality of life (QALY) to capture
                  the full impact on individuals and communities.
                </p>
                <p>
                  Costs are calculated per person by injury severity (K=Fatal, A=Incapacitating, B=Non-incapacitating,
                  C=Possible injury), plus per-vehicle costs for property-damage-only crashes. Values are in 2024
                  dollars.{" "}
                  <a
                    href="https://highways.dot.gov/sites/fhwa.dot.gov/files/2025-10/CrashCostFactSheet_508_OCT2025.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    FHWA Crash Cost Fact Sheet (PDF)
                  </a>
                </p>
              </>
            )}
          </DataSourceNote>
        </>
      )}
    </section>
  );
}
