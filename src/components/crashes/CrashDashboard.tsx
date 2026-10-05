"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Crashes, DateRange } from "@/lib/crashes";
import {
  ALL_PLACES,
  ccrpcNote,
  ccrpcRange,
  datePresets,
  inDateRange,
  loadCrashes,
  matchesPlace,
  rangeForPlace,
  summarize,
  trends,
  UNIVERSITY_DISTRICT,
} from "@/lib/crashes";
import { CrashMap } from "./CrashMap";
import { MetricCards } from "./MetricCards";
import { TrendChart } from "./TrendChart";
import {
  cardClass,
  CityFilter,
  CrashPageHeader,
  DataSourceNote,
  DateRangeControls,
  ErrorBlock,
  LoadingBlock,
} from "./shared";

const TWO_YEARS_MS = 2 * 366 * 24 * 60 * 60 * 1000;

export default function CrashDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Crashes | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCrashes().then(setData, (err: Error) => setError(err.message));
  }, []);

  // Default to the latest full year IDOT has published.
  const range: DateRange = useMemo(() => {
    const fallback = data ? datePresets(data.minDate, data.maxDate)[0].range : { start: "", end: "" };
    return {
      start: searchParams.get("start") ?? fallback.start,
      end: searchParams.get("end") ?? fallback.end,
    };
  }, [data, searchParams]);
  const city = searchParams.get("city") ?? ALL_PLACES;
  // University District data only exists for CCRPC's years, so its counts and trends use those years.
  const effectiveRange = useMemo(() => (data ? rangeForPlace(data, city, range) : range), [data, city, range]);

  const updateParams = (next: { range?: DateRange; city?: string }) => {
    const nextRange = next.range ?? range;
    const nextCity = next.city ?? city;
    const params = new URLSearchParams();
    if (nextRange.start) params.set("start", nextRange.start);
    if (nextRange.end) params.set("end", nextRange.end);
    if (nextCity !== ALL_PLACES) params.set("city", nextCity);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };

  const filtered = useMemo(
    () =>
      data
        ? data.crashes.filter((crash) => inDateRange(crash, effectiveRange) && matchesPlace(crash, city))
        : [],
    [data, effectiveRange, city],
  );
  const stats = useMemo(() => summarize(filtered), [filtered]);
  const interval =
    effectiveRange.start && effectiveRange.end && Date.parse(effectiveRange.end) - Date.parse(effectiveRange.start) > TWO_YEARS_MS
      ? "month"
      : "week";
  const trendData = useMemo(() => trends(filtered, effectiveRange, interval), [filtered, effectiveRange, interval]);

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <CrashPageHeader
        title="Champaign-Urbana Crash Dashboard"
        description="Every reported traffic crash in Champaign, Urbana, and Savoy, mapped. Filter by city and date to see patterns, trends, and where our streets are failing people."
      />

      {error && <ErrorBlock message={error} />}

      {!data && !error && <LoadingBlock label="Loading crash data..." height="h-40" />}

      {data && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <CityFilter data={data} value={city} onChange={(next) => updateParams({ city: next })} id="crash-city" />
            <DateRangeControls data={data} range={range} onChange={(next) => updateParams({ range: next })} />
          </div>

          {city === UNIVERSITY_DISTRICT && (
            <UniversityNote data={data} />
          )}

          <MetricCards stats={stats} heavyNote={ccrpcNote(data, effectiveRange, stats.heavyVehicleKnown)} />

          <div className={`${cardClass} mt-8 p-6`}>
            <h2 className="mb-4 text-xl font-semibold">{interval === "week" ? "Weekly" : "Monthly"} Trends</h2>
            <TrendChart data={trendData} interval={interval} />
          </div>

          <div className={`${cardClass} mt-8 p-6`}>
            <h2 className="mb-4 text-xl font-semibold">Crash Locations</h2>
            <CrashMap crashes={filtered} />
          </div>

          <DataSourceNote data={data} />
        </>
      )}
    </section>
  );
}

function UniversityNote({ data }: { data: Crashes }) {
  const range = ccrpcRange(data);
  if (!range) return null;
  return (
    <p className="mb-4 text-xs text-slate-600">
      University District crashes come from CCRPC&apos;s crash dashboard and are only available for{" "}
      {range.start.slice(0, 4)}–{range.end.slice(0, 4)}.
    </p>
  );
}

