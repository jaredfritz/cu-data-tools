import type { CostBreakdown, CostLine } from "@/lib/crashes";
import { formatCurrency } from "@/lib/crashes";
import { cardClass } from "./shared";

const formatFull = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const formatAbbrev = (value: number) => (value >= 1_000 ? formatCurrency(value) : formatFull(value));

const th = "px-2 py-3 text-xs font-medium uppercase tracking-wider text-slate-500";

function Row({ line, note, striped }: { line: CostLine; note?: string; striped: boolean }) {
  const muted = "text-slate-400";
  return (
    <tr className={striped ? "bg-slate-50" : "bg-white"}>
      <td className="px-2 py-2 text-sm">
        {line.label}
        {note && <span className="block text-xs text-slate-500">{note}</span>}
      </td>
      <td className={`px-2 py-2 text-right text-sm font-medium ${line.count > 0 ? "" : muted}`}>
        {line.count.toLocaleString()}
      </td>
      <td className="hidden px-2 py-2 text-right text-sm text-slate-500 sm:table-cell">{formatFull(line.unitEconomic)}</td>
      <td className={`px-2 py-2 text-right text-sm font-medium ${line.subtotalEconomic > 0 ? "text-emerald-700" : muted}`}>
        {formatAbbrev(line.subtotalEconomic)}
      </td>
      <td className="hidden px-2 py-2 text-right text-sm text-slate-500 sm:table-cell">
        {formatFull(line.unitEconomic + line.unitQaly)}
      </td>
      <td className={`px-2 py-2 text-right text-sm font-medium ${line.subtotalSocietal > 0 ? "text-indigo-700" : muted}`}>
        {formatAbbrev(line.subtotalSocietal)}
      </td>
    </tr>
  );
}

export function CostBreakdownTable({ breakdown }: { breakdown: CostBreakdown }) {
  const { injuryCosts, vehicleCosts, totalEconomic, totalSocietal } = breakdown;
  const personCount = injuryCosts.reduce((sum, line) => sum + line.count, 0);
  const personEconomic = injuryCosts.reduce((sum, line) => sum + line.subtotalEconomic, 0);
  const personSocietal = injuryCosts.reduce((sum, line) => sum + line.subtotalSocietal, 0);

  return (
    <div className={`${cardClass} p-4 sm:p-6`}>
      <h3 className="mb-4 text-lg font-semibold">Cost Breakdown by Injury Classification</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={`${th} text-left`}>Classification</th>
              <th className={`${th} text-right`}>Count</th>
              <th className={`${th} hidden text-right sm:table-cell`}>Unit Econ.</th>
              <th className={`${th} text-right`}>Subtotal Econ.</th>
              <th className={`${th} hidden text-right sm:table-cell`}>Unit Societal</th>
              <th className={`${th} text-right`}>Subtotal Societal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {injuryCosts.map((line, index) => (
              <Row key={line.label} line={line} striped={index % 2 === 1} />
            ))}
            <tr className="border-t border-slate-300 bg-slate-100 font-medium">
              <td className="px-2 py-2 text-sm">Person Subtotal</td>
              <td className="px-2 py-2 text-right text-sm">{personCount.toLocaleString()}</td>
              <td className="hidden px-2 py-2 sm:table-cell" />
              <td className="px-2 py-2 text-right text-sm text-emerald-800">{formatAbbrev(personEconomic)}</td>
              <td className="hidden px-2 py-2 sm:table-cell" />
              <td className="px-2 py-2 text-right text-sm text-indigo-800">{formatAbbrev(personSocietal)}</td>
            </tr>
            <Row line={vehicleCosts} note="(property damage only)" striped={false} />
            <tr className="border-t-2 border-slate-300 bg-slate-200 font-bold">
              <td className="px-2 py-3 text-sm">Grand Total</td>
              <td className="px-2 py-3" />
              <td className="hidden px-2 py-3 sm:table-cell" />
              <td className="px-2 py-3 text-right text-sm text-emerald-800">{formatAbbrev(totalEconomic)}</td>
              <td className="hidden px-2 py-3 sm:table-cell" />
              <td className="px-2 py-3 text-right text-sm text-indigo-800">{formatAbbrev(totalSocietal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        <strong>Methodology:</strong> Person costs use IDOT&apos;s per-crash counts of people killed (K) and with A, B,
        and C injuries. Uninjured people (O) are costed through the vehicles in crashes with no injuries, coded as
        property damage only (PDO), at FHWA O-classification rates ($6,269 + $3,927 = $10,196 per vehicle). Source:
        FHWA KABCO (2024$).
      </p>
    </div>
  );
}
