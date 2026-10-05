"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Parcel, Parcels } from "@/lib/parcels";
import {
  areaCities,
  areaLabel,
  boundsOf,
  CU_METRO,
  formatAcres,
  formatMoney,
  inArea,
  loadParcels,
  summarize,
} from "@/lib/parcels";
import {
  COLOR_SCALES,
  MAP_METRICS,
  metricConfig,
  supportsAverageScale,
  type ColorScale,
  type ParcelMetric,
} from "@/lib/parcelMapStyles";
import { cardClass, ErrorBlock, LoadingBlock } from "@/components/crashes/shared";
import { LandUseTable } from "./LandUseTable";
import { ParcelMap } from "./ParcelMap";
import { ParcelSearch } from "./ParcelSearch";
import { AboutThisData } from "@/components/site/AboutThisData";
import { AreaSelect, areaForParcel, ParcelCredit, ParcelPageHeader, ParcelSources, toggleClass, useParcelRanks } from "./shared";

export default function ValuePerAcreDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Parcels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ parcel: Parcel; key: number } | null>(null);

  useEffect(() => {
    loadParcels().then(setData, (err: Error) => setError(err.message));
  }, []);

  const area = searchParams.get("area") ?? CU_METRO;
  const metric = (MAP_METRICS.some((m) => m.id === searchParams.get("metric"))
    ? searchParams.get("metric")
    : "value") as ParcelMetric;
  const scale: ColorScale = searchParams.get("scale") === "average" ? "average" : "bands";
  // 3D is the default: height makes the gap between city cores and the rest of town clearest.
  const is3D = searchParams.get("view") !== "2d";

  const updateParams = (
    next: Partial<{ area: string; metric: ParcelMetric; scale: ColorScale; is3D: boolean }>,
  ) => {
    const state = { area, metric, scale, is3D, ...next };
    const params = new URLSearchParams();
    if (state.area !== CU_METRO) params.set("area", state.area);
    if (state.metric !== "value") params.set("metric", state.metric);
    if (state.scale !== "bands") params.set("scale", state.scale);
    if (!state.is3D) params.set("view", "2d");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const filtered = useMemo(() => (data ? data.parcels.filter((parcel) => inArea(parcel, area)) : []), [data, area]);
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const cities = useMemo(() => areaCities(area), [area]);
  const bounds = useMemo(() => (data ? boundsOf(data, area) : null), [data, area]);
  const rankFor = useParcelRanks(filtered);
  const config = metricConfig(metric);

  const showParcel = (parcel: Parcel) => {
    const nextArea = areaForParcel(parcel, area);
    if (nextArea !== area) updateParams({ area: nextArea });
    setFocus({ parcel, key: Date.now() });
  };
  // The "vs. area average" scale compares each parcel to the selected area's value per taxable acre.
  // Farmland is left out of the baseline, since it's assessed on productivity rather than market value.
  const average = useMemo(() => {
    const farm = summary.byLandUse.find((group) => group.landUse === "Farm");
    const acres = summary.taxableAcres - (farm?.acres ?? 0);
    const total = summary.value - (farm?.value ?? 0);
    return acres > 0 ? total / acres : null;
  }, [summary]);

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <ParcelPageHeader
        title="Value Per Acre"
        description="How much property value and property tax every acre of Champaign County produces. Compact, walkable blocks pay far more per acre than parking lots, strip development, and vacant land, and they cost less to serve."
      />

      {error && <ErrorBlock message={error} />}

      {!data && !error && <LoadingBlock label="Loading 78,000 parcels..." height="h-[640px]" />}

      {data && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <ParcelSearch data={data} onSelect={showParcel} />
            <AreaSelect data={data} value={area} onChange={(next) => updateParams({ area: next })} />

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Map metric">
              {MAP_METRICS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={metric === option.id}
                  onClick={() => updateParams({ metric: option.id })}
                  className={toggleClass(metric === option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {supportsAverageScale(config) && (
              <>
                <label htmlFor="parcel-scale" className="sr-only">
                  Color scale
                </label>
                <select
                  id="parcel-scale"
                  value={scale}
                  onChange={(event) => updateParams({ scale: event.target.value as ColorScale })}
                  className="rounded-[4px] border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm"
                >
                  {COLOR_SCALES.map((option) => (
                    <option key={option.id} value={option.id}>
                      Color: {option.label}
                    </option>
                  ))}
                </select>
              </>
            )}

            <div className="flex gap-1.5" role="group" aria-label="Map view">
              <button type="button" aria-pressed={!is3D} onClick={() => updateParams({ is3D: false })} className={toggleClass(!is3D)}>
                2D
              </button>
              <button type="button" aria-pressed={is3D} onClick={() => updateParams({ is3D: true })} className={toggleClass(is3D)}>
                3D
              </button>
            </div>

          </div>

          <SummaryCards summary={summary} />

          <div className={`${cardClass} mt-8 p-4 md:p-6`}>
            <div className="mb-4">
              <h2 className="text-xl font-semibold">
                {config.label} · {areaLabel(area)}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {config.description}{" "}
                {scale === "average" && supportsAverageScale(config) && average !== null
                  ? `Red parcels produce less per acre than the ${areaLabel(area)} average of ${formatMoney(average, { compact: true })} (excluding farmland); blue parcels produce more. `
                  : ""}
                Click any parcel for details.
              </p>
            </div>
            <ParcelMap
              data={data}
              metric={metric}
              scale={scale}
              average={average}
              cities={cities}
              bounds={bounds}
              is3D={is3D}
              focus={focus}
              rankFor={rankFor}
              areaName={areaLabel(area)}
            />
          </div>

          <div className={`${cardClass} mt-8 p-4 md:p-6`}>
            <h2 className="text-xl font-semibold">Land Use · {areaLabel(area)}</h2>
            <p className="mt-1 mb-4 text-sm text-slate-600">
              Compare each land use&apos;s share of the land with its share of the tax base. Uses that take up more land
              than they pay for lean on the rest.
            </p>
            <LandUseTable summary={summary} />
          </div>

          <MethodologyNote data={data} />
        </>
      )}
    </section>
  );
}

function SummaryCards({ summary }: { summary: ReturnType<typeof summarize> }) {
  const metrics = [
    { label: "Market value (est.)", value: formatMoney(summary.value, { compact: true }) },
    { label: "Property tax before exemptions", value: formatMoney(summary.tax, { compact: true }) },
    {
      label: "Average value per taxable acre",
      value: formatMoney(summary.taxableAcres > 0 ? summary.value / summary.taxableAcres : null, { compact: true }),
    },
    {
      label: "Vacant land",
      value: `${formatAcres(summary.vacantAcres)} acres`,
      detail: `${summary.vacantParcels.toLocaleString()} parcels`,
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

function MethodologyNote({ data }: { data: Parcels }) {
  const { meta } = data;
  return (
    <AboutThisData credit={<ParcelCredit />}>
      <p>
        <strong>Market value</strong> is three times each parcel&apos;s equalized assessed value (EAV), since Illinois
        assesses property at one-third of market value outside Cook County. Farmland is assessed on what it can produce,
        not its sale price, so farmland is shown in its own tan color instead of on the value scale and is left out of
        the area average. <strong>Property tax</strong> is EAV times the
        parcel&apos;s {meta.taxYear} tax code rate, before homestead and other exemptions, so it overstates bills for
        owner-occupied homes. <strong>Land share</strong> uses the assessor&apos;s land and building split. Exempt
        property (government, schools, churches, the University) has no assessed value and is shown with gray hatching.
        Condo and townhome units are mapped by the county as building footprints only, without the
        shared land around them, so each development&apos;s units are combined into one shape: the outline around its
        buildings plus an 8-meter margin, trimmed so it doesn&apos;t overlap neighboring parcels. Those areas are
        approximate. <strong>Percentiles</strong> in parcel details compare a parcel with the taxable, non-farm
        parcels in the selected area. Because these values are estimates, they&apos;re rounded to the nearest 10th
        percentile, except the top and bottom 5%. Wind and solar
        lease areas drawn over farm parcels are left out to avoid double counting.
      </p>
      <ParcelSources meta={meta} />
    </AboutThisData>
  );
}
