"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AboutThisData } from "@/components/site/AboutThisData";
import { DataUpdated } from "@/components/site/DataUpdated";
import { usePathname } from "next/navigation";
import type { Crash, Crashes, DatePreset, DateRange } from "@/lib/crashes";
import { ALL_PLACES, datePresets, placeLabel, UNIVERSITY_DISTRICT } from "@/lib/crashes";

export const cardClass = "rounded-[4px] border border-[var(--color-border)] bg-white";

const TABS = [
  { href: "/data/crashes", label: "Dashboard" },
  { href: "/data/crashes/location-report", label: "Location Report" },
];

export function CrashPageHeader({ title, description }: { title: string; description: string }) {
  const pathname = usePathname();
  return (
    <div className="mb-8">
      <nav aria-label="Crash data views" className="mb-5 flex gap-2 text-sm font-medium">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={pathname === tab.href ? "page" : undefined}
            className={
              pathname === tab.href
                ? "rounded-[4px] bg-[var(--color-primary)] px-3 py-1.5 text-white"
                : "rounded-[4px] border border-[var(--color-border)] bg-white px-3 py-1.5 hover:bg-slate-50"
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <h1 className="text-3xl font-extrabold md:text-4xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-700 md:text-base">{description}</p>
      <DataUpdated dataset="crashes" className="mt-2" />
    </div>
  );
}

export function DateRangeControls({
  data,
  range,
  onChange,
  compact = false,
}: {
  data: Crashes;
  range: DateRange;
  onChange: (range: DateRange) => void;
  compact?: boolean;
}) {
  const presets: DatePreset[] = datePresets(data.minDate, data.maxDate);
  const active = presets.find((preset) => preset.range.start === range.start && preset.range.end === range.end);
  const inputClass = `min-w-0 rounded-[4px] border border-[var(--color-border)] bg-white px-2 py-1.5 ${
    compact ? "flex-1 text-xs" : "text-sm"
  }`;

  return (
    <div className={compact ? "space-y-2" : "flex flex-wrap items-center gap-3"}>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.range)}
            className={`rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors ${
              active?.id === preset.id
                ? "bg-[var(--color-primary)] text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`crash-start-${compact ? "c" : "f"}`}>
          Start date
        </label>
        <input
          id={`crash-start-${compact ? "c" : "f"}`}
          type="date"
          min={data.minDate}
          max={data.maxDate}
          value={range.start}
          onChange={(event) => onChange({ ...range, start: event.target.value })}
          className={inputClass}
        />
        <span className="text-slate-500">to</span>
        <label className="sr-only" htmlFor={`crash-end-${compact ? "c" : "f"}`}>
          End date
        </label>
        <input
          id={`crash-end-${compact ? "c" : "f"}`}
          type="date"
          min={data.minDate}
          max={data.maxDate}
          value={range.end}
          onChange={(event) => onChange({ ...range, end: event.target.value })}
          className={inputClass}
        />
      </div>
    </div>
  );
}

/** Place filter options: all three cities, each city, and the University District when CCRPC data is present. */
export function placeOptions(data: Crashes): { value: string; label: string }[] {
  const ccrpcYears = data.meta.ccrpc?.years ?? [];
  return [
    { value: ALL_PLACES, label: placeLabel(ALL_PLACES) },
    ...data.meta.cities.map((city) => ({ value: city, label: city })),
    ...(ccrpcYears.length
      ? [
          {
            value: UNIVERSITY_DISTRICT,
            label: `${placeLabel(UNIVERSITY_DISTRICT)} (${ccrpcYears[0]}–${ccrpcYears.at(-1)})`,
          },
        ]
      : []),
  ];
}

export function CityFilter({
  data,
  value,
  onChange,
  id,
  className = "",
}: {
  data: Crashes;
  value: string;
  onChange: (place: string) => void;
  id: string;
  className?: string;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Place
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`rounded-[4px] border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm ${className}`}
      >
        {placeOptions(data).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}

export function CrashPopup({ crash }: { crash: Crash }) {
  const location = [crash.street, crash.crossStreet].filter(Boolean).join(" & ");
  return (
    <div className="min-w-[200px] text-[var(--color-primary)]">
      <p className="font-semibold">
        {new Date(`${crash.date}T00:00:00`).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
        <span className="font-normal text-slate-500"> · {crash.city}</span>
      </p>
      {location && <p className="text-sm text-slate-600">{location}</p>}
      <div className="mt-2 space-y-1 text-sm">
        {crash.fatalities > 0 && <p className="font-medium text-red-600">{crash.fatalities} killed</p>}
        {crash.aInjuries > 0 && <p className="text-orange-600">{crash.aInjuries} incapacitating injuries</p>}
        {crash.injuries > 0 && <p className="text-yellow-700">{crash.injuries} total injuries</p>}
        {crash.hitAndRun && <p className="font-medium text-purple-600">Hit and run</p>}
        {crash.heavyVehicle && <p className="font-medium text-cyan-700">Heavy vehicle involved</p>}
        {crash.universityDistrict && <p className="text-slate-500">University District</p>}
        {crash.crashType && <p className="text-slate-500">{crash.crashType}</p>}
        {crash.cause && <p className="text-slate-500">Cause: {crash.cause}</p>}
      </div>
    </div>
  );
}

/** The crash pages' "About this data" notes. `children` adds page-specific notes ahead of the sources. */
export function DataSourceNote({ data, children }: { data: Crashes; children?: ReactNode }) {
  const years = data.meta.years;
  return (
    <AboutThisData
      credit={
        <>
          Adapted from the open-source{" "}
          <a
            href="https://github.com/MisterClean/chicago-crashes-pipeline"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Chicago Crash Dashboard
          </a>{" "}
          by{" "}
          <a href="https://bsky.app/profile/mclean.bsky.social" target="_blank" rel="noopener noreferrer" className="underline">
            Michael McLean
          </a>{" "}
          (MIT license).
        </>
      }
    >
      {children}
      <p>
        Sources:{" "}
        <a href={data.meta.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
          Illinois Department of Transportation crash data
        </a>
        , City of Champaign, City of Urbana, and Village of Savoy, {years[0]}–{years.at(-1)}. Crashes are assigned to a
        city using the municipality IDOT records for each crash. IDOT publishes each year once it is complete, so recent months
        may be missing. Pedestrian and bicycle counts use IDOT&apos;s &ldquo;type of first crash&rdquo;. Street names are
        only included in IDOT&apos;s data from 2025 on. Crashes are only reported above Illinois&apos; property-damage
        threshold, so minor crashes may not be included.
      </p>
      {data.meta.ccrpc && (
        <p>
          Heavy-vehicle and University District fields come from the{" "}
          <a href={data.meta.ccrpc.source} target="_blank" rel="noopener noreferrer" className="underline">
            Champaign County Regional Planning Commission&apos;s crash dashboard
          </a>{" "}
          ({data.meta.ccrpc.years[0]}–{data.meta.ccrpc.years.at(-1)}), which is built from the same IDOT crashes.
          CCRPC doesn&apos;t publish crash IDs, so its records were matched to IDOT&apos;s by year, city, injuries,
          crash type, cause, and location ({data.meta.ccrpc.matched.toLocaleString()} of{" "}
          {data.meta.ccrpc.ccrpcCrashes.toLocaleString()} matched). Other years show these fields as not available.
        </p>
      )}
    </AboutThisData>
  );
}

export function LoadingBlock({ label, height = "h-[600px]" }: { label: string; height?: string }) {
  return (
    <div className={`${height} flex animate-pulse items-center justify-center rounded-[4px] bg-slate-100`}>
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-[4px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
  );
}
