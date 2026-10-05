import type { CauseSummary } from "@/lib/crashes";

const th = "px-2 py-3 text-xs font-medium uppercase tracking-wider text-slate-500";

export function CausesTable({ causes }: { causes: CauseSummary[] }) {
  if (causes.length === 0) {
    return <div className="py-8 text-center text-slate-500">No crash data available for this area</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className={`${th} text-left`}>Cause</th>
            <th className={`${th} text-right`}>Crashes</th>
            <th className={`${th} text-right`}>%</th>
            <th className={`${th} text-right`}>Injuries</th>
            <th className={`${th} text-right`}>Fatal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {causes.map((cause, index) => (
            <tr key={cause.cause} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
              <td className="px-2 py-2 text-sm">{cause.cause}</td>
              <td className="px-2 py-2 text-right text-sm font-medium">{cause.crashes.toLocaleString()}</td>
              <td className="px-2 py-2 text-right">
                <span className="text-xs text-slate-500">{cause.percentage}%</span>
              </td>
              <td className={`px-2 py-2 text-right text-sm ${cause.injuries > 0 ? "font-medium text-orange-600" : "text-slate-400"}`}>
                {cause.injuries.toLocaleString()}
              </td>
              <td className={`px-2 py-2 text-right text-sm ${cause.fatalities > 0 ? "font-bold text-red-600" : "text-slate-400"}`}>
                {cause.fatalities > 0 ? cause.fatalities : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
