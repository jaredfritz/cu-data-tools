import type { Parcel, ParcelRanks } from "@/lib/parcels";
import {
  countyParcelUrl,
  formatAcres,
  formatMoney,
  formatPin,
  propertyClassLabel,
  displayAddress,
} from "@/lib/parcels";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}

export function ParcelPopup({
  parcel,
  taxYear,
  ranks,
  areaName,
}: {
  parcel: Parcel;
  taxYear: number | null;
  /** Rounded percentiles against comparable parcels in the selected area */
  ranks?: ParcelRanks | null;
  areaName?: string;
}) {
  const title = parcel.address ? displayAddress(parcel.address) : `Parcel ${formatPin(parcel.pin)}`;
  const taxNote = parcel.exempt
    ? "Exempt"
    : parcel.taxRate === null
      ? "Rate not yet published"
      : formatMoney(parcel.tax);

  return (
    <div className="min-w-[230px] text-xs">
      {/* Right padding keeps the title clear of the popup's close button. */}
      <p className="pr-8 text-sm font-bold text-[var(--color-primary)]">{title}</p>
      <p className="mt-0.5 text-slate-500">
        {parcel.city}
        {parcel.condoDevelopment
          ? ` · Condo or townhome development, ${parcel.units} ${parcel.units === 1 ? "unit" : "units"}`
          : parcel.units > 1
            ? ` · ${parcel.units} condo units`
            : ""}
      </p>
      <dl className="mt-2 border-t border-slate-200 pt-1.5">
        <Row label="Value per acre" value={formatMoney(parcel.valuePerAcre)} />
        <Row label="Tax per acre (est.)" value={formatMoney(parcel.taxPerAcre)} />
        <Row label="Market value (est.)" value={parcel.exempt ? "Exempt" : formatMoney(parcel.marketValue)} />
        <Row label={`${taxYear ?? ""} tax before exemptions`.trim()} value={taxNote} />
        <Row
          label="Land share of value"
          value={parcel.landShare === null ? "—" : `${Math.round(parcel.landShare * 100)}%`}
        />
        <Row label="Acres" value={formatAcres(parcel.acres)} />
        <Row label="Class" value={propertyClassLabel(parcel.useCode)} />
        {parcel.tif && <Row label="TIF district" value={parcel.tif.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bTif\b/, "TIF")} />}
      </dl>
      {ranks && (
        <dl className="mt-1.5 border-t border-slate-200 pt-1.5">
          <p className="mb-0.5 text-[11px] text-slate-500">Compared with taxable parcels in {areaName}</p>
          <Row label="Value per acre" value={ranks.valuePerAcre} />
          <Row label="Total value" value={ranks.value} />
        </dl>
      )}
      {parcel.heldWithNeighbor && (
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          Held with the property next door (same taxpayer), such as a side yard or parking.
        </p>
      )}
      {!parcel.address && (
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">No site address in the county&apos;s records.</p>
      )}
      {parcel.condoDevelopment && (
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          Approximate area: the shared land around condo and townhome buildings isn&apos;t a separate parcel, so it&apos;s
          estimated from the buildings plus a margin.
        </p>
      )}
      {parcel.landUse === "Farm" && (
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          Farmland is assessed on what it can produce, not its market value.
        </p>
      )}
      <a
        href={countyParcelUrl(parcel.pin, taxYear)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block font-semibold text-[var(--color-accent-secondary)] underline"
      >
        County record for {formatPin(parcel.pin)} ↗
      </a>
    </div>
  );
}
