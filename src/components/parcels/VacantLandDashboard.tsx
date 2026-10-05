"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Parcel, Parcels } from "@/lib/parcels";
import {
  areaCities,
  areaLabel,
  boundsOf,
  countyParcelUrl,
  CU_METRO,
  formatAcres,
  formatMoney,
  formatPin,
  inArea,
  loadParcels,
  displayAddress,
} from "@/lib/parcels";
import { summarizeVacant, vacantTypeConfig, VACANT_TYPES, type VacantSummary } from "@/lib/vacant";
import { cardClass, ErrorBlock, LoadingBlock } from "@/components/crashes/shared";
import { ParcelSearch } from "./ParcelSearch";
import { AboutThisData } from "@/components/site/AboutThisData";
import { AreaSelect, areaForParcel, ParcelCredit, ParcelPageHeader, ParcelSources, useParcelRanks } from "./shared";
import { VacantLandMap } from "./VacantLandMap";

const th = "px-2 py-3 text-xs font-medium uppercase tracking-wider text-slate-500";
const td = "px-2 py-2 text-right text-sm tabular-nums";

export default function VacantLandDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Parcels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ parcel: Parcel; key: number } | null>(null);
  const mapSection = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadParcels().then(setData, (err: Error) => setError(err.message));
  }, []);

  const area = searchParams.get("area") ?? CU_METRO;
  const showHeld = searchParams.get("held") !== "0";
  const updateParams = (next: Partial<{ area: string; showHeld: boolean }>) => {
    const state = { area, showHeld, ...next };
    const params = new URLSearchParams();
    if (state.area !== CU_METRO) params.set("area", state.area);
    if (!state.showHeld) params.set("held", "0");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const setArea = (next: string) => updateParams({ area: next });

  const filtered = useMemo(() => (data ? data.parcels.filter((parcel) => inArea(parcel, area)) : []), [data, area]);
  const summary = useMemo(() => summarizeVacant(filtered, { includeHeld: showHeld }), [filtered, showHeld]);
  const cities = useMemo(() => areaCities(area), [area]);
  const bounds = useMemo(() => (data ? boundsOf(data, area) : null), [data, area]);

  const rankFor = useParcelRanks(filtered);

  const showOnMap = (parcel: Parcel) => {
    const nextArea = areaForParcel(parcel, area);
    if (nextArea !== area) setArea(nextArea);
    setFocus({ parcel, key: Date.now() });
    mapSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <ParcelPageHeader
        title="Vacant Land"
        description="Every parcel the county assessor classes as vacant land. Empty lots in town are places new homes and businesses could go, and land that produces almost nothing while the city still maintains the streets and pipes around it."
      />

      {error && <ErrorBlock message={error} />}

      {!data && !error && <LoadingBlock label="Loading 78,000 parcels..." height="h-[640px]" />}

      {data && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <ParcelSearch data={data} onSelect={showOnMap} />
            <AreaSelect data={data} value={area} onChange={setArea} />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showHeld}
                onChange={(event) => updateParams({ showHeld: event.target.checked })}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              Show lots held with the property next door
            </label>
          </div>

          <SummaryCards summary={summary} />

          <div ref={mapSection} className={`${cardClass} mt-8 scroll-mt-4 p-4 md:p-6`}>
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Vacant Land · {areaLabel(area)}</h2>
              <p className="mt-1 text-sm text-slate-600">
                Vacant parcels by type. Hatched lots are held with the built property next door, such as a side yard or
                a business&apos;s parking. Everything else is shown in gray for context. Click any parcel for details.
              </p>
            </div>
            <VacantLandMap
              data={data}
              cities={cities}
              bounds={bounds}
              focus={focus}
              rankFor={rankFor}
              areaName={areaLabel(area)}
              showHeld={showHeld}
            />
          </div>

          <div className={`${cardClass} mt-8 p-4 md:p-6`}>
            <h2 className="text-xl font-semibold">Vacant Land by Type · {areaLabel(area)}</h2>
            <TypeTable summary={summary} />
          </div>

          <div className={`${cardClass} mt-8 p-4 md:p-6`}>
            <h2 className="text-xl font-semibold">Largest Vacant Parcels · {areaLabel(area)}</h2>
            <p className="mt-1 mb-4 text-sm text-slate-600">
              {showHeld ? "Includes lots held with the property next door. " : "Standalone vacant lots only. "}
              Click a row to see the parcel on the map.
            </p>
            <LargestTable parcels={summary.largest} taxYear={data.meta.taxYear} onSelect={showOnMap} />
          </div>

          <MethodologyNote data={data} />
        </>
      )}
    </section>
  );
}

function SummaryCards({ summary }: { summary: VacantSummary }) {
  const subdivision = summary.byType.find((group) => group.type === "subdivision");
  const subdivisionAcres = (subdivision?.acres ?? 0) + (subdivision?.heldAcres ?? 0);
  const metrics = [
    {
      label: "Standalone vacant parcels",
      value: summary.parcels.toLocaleString(),
      detail: `+${summary.heldParcels.toLocaleString()} held with the property next door`,
    },
    {
      label: "Standalone vacant acres",
      value: formatAcres(summary.acres),
      detail: `${summary.areaAcres > 0 ? Math.round((summary.acres / summary.areaAcres) * 100) : 0}% of parcel land · +${formatAcres(summary.heldAcres)} acres held with neighbors`,
    },
    { label: "Market value, standalone (est.)", value: formatMoney(summary.value, { compact: true }) },
    {
      label: "Assessed at subdivision rate (10-30)",
      value: `${formatAcres(subdivisionAcres)} acres`,
      detail: subdivision && subdivision.acres > 0 ? `${formatMoney(subdivision.value / subdivision.acres, { compact: true })} per acre` : undefined,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className={`${cardClass} p-4`}>
          <p className="text-sm text-slate-600">{metric.label}</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-primary)]">{metric.value}</p>
          {metric.detail && <p className="text-xs text-slate-500">{metric.detail}</p>}
        </div>
      ))}
    </div>
  );
}

function TypeTable({ summary }: { summary: VacantSummary }) {
  if (summary.byType.length === 0) {
    return <div className="py-8 text-center text-slate-500">No vacant parcels in this area</div>;
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className={`${th} text-left`}>Type</th>
            <th className={`${th} text-right`}>Standalone parcels</th>
            <th className={`${th} text-right`}>Standalone acres</th>
            <th className={`${th} text-right`}>Value per acre</th>
            <th className={`${th} text-right`}>Held with neighbor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {summary.byType.map((group, index) => {
            const config = vacantTypeConfig(group.type);
            return (
              <tr key={group.type} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className="px-2 py-2 text-sm">
                  <span className="flex items-start gap-2">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-[2px]" style={{ backgroundColor: config.color }} />
                    <span>
                      <span className="font-medium">{config.label}</span>
                      <span className="block text-xs text-slate-500">{config.description}</span>
                    </span>
                  </span>
                </td>
                <td className={td}>{group.parcels.toLocaleString()}</td>
                <td className={td}>{formatAcres(group.acres)}</td>
                <td className={td}>{formatMoney(group.acres > 0 ? group.value / group.acres : null, { compact: true })}</td>
                <td className={td}>
                  {group.heldParcels.toLocaleString()}
                  <span className="block text-xs text-slate-500">{formatAcres(group.heldAcres)} acres</span>
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-[var(--color-border)] font-semibold">
            <td className="px-2 py-2 text-sm">Total</td>
            <td className={td}>{summary.parcels.toLocaleString()}</td>
            <td className={td}>{formatAcres(summary.acres)}</td>
            <td className={td}>{formatMoney(summary.acres > 0 ? summary.value / summary.acres : null, { compact: true })}</td>
            <td className={td}>
              {summary.heldParcels.toLocaleString()}
              <span className="block text-xs font-normal text-slate-500">{formatAcres(summary.heldAcres)} acres</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">
        &ldquo;Held with neighbor&rdquo; lots touch a built parcel with the same taxpayer, such as a side yard, an extra
        lot, or a business&apos;s parking. Value per acre is for standalone lots.
      </p>
    </div>
  );
}

function LargestTable({
  parcels,
  taxYear,
  onSelect,
}: {
  parcels: Parcel[];
  taxYear: number | null;
  onSelect: (parcel: Parcel) => void;
}) {
  if (parcels.length === 0) {
    return <div className="py-8 text-center text-slate-500">No vacant parcels in this area</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className={`${th} text-left`}>Parcel</th>
            <th className={`${th} text-left`}>Type</th>
            <th className={`${th} text-right`}>Acres</th>
            <th className={`${th} text-right`}>Value per acre</th>
            <th className={`${th} text-right`}>County record</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {parcels.map((parcel, index) => {
            const config = parcel.vacantType ? vacantTypeConfig(parcel.vacantType) : VACANT_TYPES[0];
            return (
              <tr
                key={parcel.pin}
                onClick={() => onSelect(parcel)}
                className={`cursor-pointer hover:bg-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
              >
                <td className="px-2 py-2 text-sm">
                  <button type="button" onClick={() => onSelect(parcel)} className="text-left font-medium hover:underline">
                    {parcel.address ? displayAddress(parcel.address) : `Parcel ${formatPin(parcel.pin)}`}
                  </button>
                  <span className="block text-xs text-slate-500">{parcel.city}</span>
                </td>
                <td className="px-2 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-[2px]" style={{ backgroundColor: config.color }} />
                    {config.label.replace(/^Vacant,? /, "").replace(/^\w/, (c) => c.toUpperCase())}
                  </span>
                  {parcel.heldWithNeighbor && (
                    <span className="block text-xs text-slate-500">Held with property next door</span>
                  )}
                </td>
                <td className={td}>{formatAcres(parcel.acres)}</td>
                <td className={td}>{formatMoney(parcel.valuePerAcre, { compact: true })}</td>
                <td className={td}>
                  <a
                    href={countyParcelUrl(parcel.pin, taxYear)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="text-[var(--color-accent-secondary)] underline"
                  >
                    {formatPin(parcel.pin)} ↗
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MethodologyNote({ data }: { data: Parcels }) {
  return (
    <AboutThisData credit={<ParcelCredit />}>
      <p>
        Vacant land is every parcel the Champaign County assessor classes as vacant (residential, commercial, or
        industrial vacant land, plus the &ldquo;10-30&rdquo; subdivision classes). <strong>Surface parking lots are not
        included</strong>: the assessor classes them as improved commercial property. See the{" "}
        <Link href="https://www.abundantcu.com/data/parking" className="underline">
          parking map
        </Link>{" "}
        for those. Exempt vacant land, such as city- or university-owned lots, is not counted.
      </p>
      <p>
        <strong>Held with the property next door:</strong> a vacant lot that touches a built parcel with the same
        taxpayer name or mailing address is marked as held with it, since it usually works as a side yard, an extra lot,
        or a business&apos;s parking. Owner names are used only to make this match and aren&apos;t published. Matching
        is approximate: an owner listed differently on the two parcels, or lots separated by an alley, won&apos;t be
        matched.
      </p>
      <p>
        <strong>Subdivision rate (10-30):</strong> under 35 ILCS 200/10-30, land that has been platted into a
        subdivision keeps its pre-subdivision assessment, usually farmland rates, until a lot is built on or sold. That
        is why these parcels show values of a few thousand dollars per acre while ordinary vacant lots nearby are
        valued in the hundreds of thousands.
      </p>
      <p>
        Market value is three times the equalized assessed value, calculated the same way as on the{" "}
        <Link href="/data/value-per-acre" className="underline">
          Value Per Acre
        </Link>{" "}
        map.
      </p>
      <ParcelSources meta={data.meta} />
    </AboutThisData>
  );
}
