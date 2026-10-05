import type { AreaSummary } from "@/lib/parcels";
import { formatAcres, formatMoney } from "@/lib/parcels";

const th = "px-2 py-3 text-xs font-medium uppercase tracking-wider text-slate-500";
const td = "px-2 py-2 text-right text-sm tabular-nums";

const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

export function LandUseTable({ summary }: { summary: AreaSummary }) {
  if (summary.parcels === 0) {
    return <div className="py-8 text-center text-slate-500">No parcels in this area</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className={`${th} text-left`}>Land use</th>
            <th className={`${th} text-right`}>Parcels</th>
            <th className={`${th} text-right`}>Acres</th>
            <th className={`${th} text-right`}>Share of land</th>
            <th className={`${th} text-right`}>Share of tax</th>
            <th className={`${th} text-right`}>Value per acre</th>
            <th className={`${th} text-right`}>Tax per acre</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {summary.byLandUse.map((row, index) => (
            <tr key={row.landUse} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
              <td className="px-2 py-2 text-sm font-medium">{row.landUse}</td>
              <td className={td}>{row.parcels.toLocaleString()}</td>
              <td className={td}>{formatAcres(row.acres)}</td>
              <td className={td}>{percent(row.acres, summary.acres)}</td>
              <td className={`${td} font-semibold`}>{percent(row.tax, summary.tax)}</td>
              <td className={td}>{row.landUse === "Exempt" ? "—" : formatMoney(row.acres > 0 ? row.value / row.acres : null, { compact: true })}</td>
              <td className={td}>{row.landUse === "Exempt" ? "—" : formatMoney(row.acres > 0 ? row.tax / row.acres : null, { compact: true })}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-[var(--color-border)] font-semibold">
            <td className="px-2 py-2 text-sm">Total</td>
            <td className={td}>{summary.parcels.toLocaleString()}</td>
            <td className={td}>{formatAcres(summary.acres)}</td>
            <td className={td}>100%</td>
            <td className={td}>100%</td>
            <td className={td}>{formatMoney(summary.taxableAcres > 0 ? summary.value / summary.taxableAcres : null, { compact: true })}</td>
            <td className={td}>{formatMoney(summary.taxableAcres > 0 ? summary.tax / summary.taxableAcres : null, { compact: true })}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">
        Acres are parcel areas, so streets and other right-of-way are not counted. Totals for value and tax per acre use
        taxable acres only.
      </p>
    </div>
  );
}
