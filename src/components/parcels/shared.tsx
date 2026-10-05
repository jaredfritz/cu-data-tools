"use client";

import { useCallback, useMemo, useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { DataUpdated } from "@/components/site/DataUpdated";
import type { Parcel, ParcelRanks, Parcels } from "@/lib/parcels";
import { ALL_COUNTY, areaLabel, CU_METRO, inArea, percentileTable, rankParcel } from "@/lib/parcels";

export const toggleClass = (active: boolean) =>
  `rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors ${
    active ? "bg-[var(--color-primary)] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
  }`;

/** Page title and description for the parcel maps. */
export function ParcelPageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-extrabold md:text-4xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-700 md:text-base">{description}</p>
      <DataUpdated dataset="parcels" className="mt-2" />
    </div>
  );
}

/** Attribution at the end of the parcel pages' "About this data" notes. */
export function ParcelCredit() {
  return (
    <>
      Adapted from the open-source{" "}
      <a
        href="https://github.com/StrongTownsChicago/chicago-value-per-acre"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        Value Per Acre map
      </a>{" "}
      by{" "}
      <a href="https://www.strongtownschicago.org/value-per-acre-map" target="_blank" rel="noopener noreferrer" className="underline">
        Strong Towns Chicago
      </a>{" "}
      (MIT license).
    </>
  );
}

/** Full source list for the parcel pages' "About this data" notes. */
export function ParcelSources({ meta }: { meta: Parcels["meta"] }) {
  return (
    <p>
      Sources: parcel boundaries and assessments from the{" "}
      <a href={meta.parcelSourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
        Champaign County GIS Consortium via City of Champaign GIS
      </a>
      ; tax rates from the{" "}
      <a href={meta.rateSourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
        Champaign County Clerk&apos;s {meta.taxYear} rate book
      </a>
      ; site addresses from the{" "}
      <a href={meta.addressSourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
        Champaign County property tax inquiry
      </a>
      . Municipalities come from each parcel&apos;s tax code. Values are estimates for illustration, not official tax
      bills.
    </p>
  );
}

export function AreaSelect({
  data,
  value,
  onChange,
}: {
  data: Parcels;
  value: string;
  onChange: (area: string) => void;
}) {
  return (
    <>
      <label htmlFor="parcel-area" className="sr-only">
        Area
      </label>
      <select
        id="parcel-area"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-[4px] border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm"
      >
        <option value={CU_METRO}>{areaLabel(CU_METRO)}</option>
        <option value={ALL_COUNTY}>{areaLabel(ALL_COUNTY)}</option>
        <optgroup label="Municipality">
          {data.cities
            .filter((city) => city.name !== "Unincorporated")
            .map((city) => (
              <option key={city.name} value={city.name}>
                {city.name}
              </option>
            ))}
        </optgroup>
        <option value="Unincorporated">Unincorporated areas</option>
      </select>
    </>
  );
}

/** Popup class that enlarges MapLibre's close button (styled in globals.css). */
export const PARCEL_POPUP_CLASS = "parcel-popup";

export interface ParcelSelection {
  parcel: Parcel;
  lngLat: [number, number];
}

/**
 * Click handling shared by the parcel maps. While a popup is open, a click elsewhere on the map only
 * closes it; the next click selects a parcel. This keeps a stray click from jumping to another parcel.
 */
export function useParcelSelection(data: Parcels) {
  const [selected, setSelected] = useState<ParcelSelection | null>(null);
  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      if (selected) {
        setSelected(null);
        return;
      }
      const index = event.features?.[0]?.properties?.i;
      if (typeof index === "number") {
        setSelected({ parcel: data.parcels[index], lngLat: [event.lngLat.lng, event.lngLat.lat] });
      }
    },
    [data, selected],
  );
  return { selected, setSelected, handleClick };
}

/** Percentile ranks against comparable parcels in the selected area, for parcel popups. */
export function useParcelRanks(areaParcels: Parcel[]): (parcel: Parcel) => ParcelRanks | null {
  const table = useMemo(() => percentileTable(areaParcels), [areaParcels]);
  return useCallback((parcel: Parcel) => rankParcel(table, parcel), [table]);
}

/** The area to switch to so a searched parcel is visible: keep the current area if it already includes it. */
export function areaForParcel(parcel: Parcel, area: string): string {
  return inArea(parcel, area) ? area : parcel.city;
}
