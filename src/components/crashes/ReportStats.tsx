import type { LocationReport } from "@/lib/crashes";
import { formatCurrency } from "@/lib/crashes";
import { CostBreakdownTable } from "./CostBreakdownTable";
import { cardClass } from "./shared";

export function ReportStats({ report, heavyNote }: { report: LocationReport; heavyNote?: string | null }) {
  const { stats, costs } = report;

  const metrics = [
    { label: "Total Crashes", value: stats.totalCrashes, color: "text-slate-800", bg: "bg-slate-100" },
    {
      label: "Fatalities",
      value: stats.totalFatalities,
      color: "text-red-700",
      bg: "bg-red-50",
      highlight: stats.totalFatalities > 0,
    },
    { label: "Incapacitating Injuries", value: stats.incapacitatingInjuries, color: "text-amber-700", bg: "bg-amber-50" },
    { label: "Total Injuries", value: stats.totalInjuries, color: "text-amber-700", bg: "bg-amber-50" },
    { label: "Pedestrian Crashes", value: stats.pedestrianCrashes, color: "text-slate-700", bg: "bg-slate-50" },
    { label: "Bicycle Crashes", value: stats.bicycleCrashes, color: "text-slate-700", bg: "bg-slate-50" },
    { label: "Hit & Run", value: stats.hitAndRunCount, color: "text-amber-700", bg: "bg-amber-50" },
    { label: "Crashes with Injuries", value: stats.crashesWithInjuries, color: "text-amber-700", bg: "bg-amber-50" },
    { label: "Vehicles Involved", value: stats.totalVehicles, color: "text-slate-700", bg: "bg-slate-50" },
  ];
  const showHeavy = heavyNote !== null && heavyNote !== undefined;

  const injuryRate = stats.totalCrashes > 0 ? Math.round((stats.crashesWithInjuries / stats.totalCrashes) * 100) : 0;
  const fatalityRate =
    stats.totalCrashes > 0 ? ((stats.crashesWithFatalities / stats.totalCrashes) * 100).toFixed(2) : "0";

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-[4px] bg-emerald-600 p-6 text-white">
          <p className="mb-1 text-sm font-medium text-emerald-100">Est. Economic Cost</p>
          <p className="text-3xl font-bold">{formatCurrency(costs.totalEconomic)}</p>
          <p className="mt-2 text-xs text-emerald-100">Based on FHWA KABCO methodology (2024$)</p>
        </div>
        <div className="rounded-[4px] bg-[var(--color-primary)] p-6 text-white">
          <p className="mb-1 text-sm font-medium text-slate-200">Est. Total Societal Cost</p>
          <p className="text-3xl font-bold">{formatCurrency(costs.totalSocietal)}</p>
          <p className="mt-2 text-xs text-slate-200">Includes economic + quality-adjusted life years (QALY)</p>
        </div>
      </div>

      <div className={`${cardClass} mb-6 p-6`}>
        <h3 className="mb-4 text-lg font-semibold">Key Insights</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Insight value={`${injuryRate}%`} title="Injury Rate" detail="of crashes result in injuries" tone="amber" />
          <Insight value={`${fatalityRate}%`} title="Fatality Rate" detail="of crashes result in a death" tone="red" />
          <Insight
            value={(stats.pedestrianCrashes + stats.bicycleCrashes).toLocaleString()}
            title="Vulnerable Road Users"
            detail="pedestrian and bicycle crashes"
            tone="slate"
          />
        </div>
      </div>

      <div className="mb-6">
        <CostBreakdownTable breakdown={costs} />
      </div>

      <div className={`${cardClass} p-6`}>
        <h3 className="mb-4 text-lg font-semibold">Detailed Metrics</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className={`${metric.bg} rounded-[4px] p-4 ${metric.highlight ? "ring-2 ring-red-500 ring-offset-1" : ""}`}
            >
              <p className="mb-1 truncate text-xs text-slate-600">{metric.label}</p>
              <p className={`text-right text-2xl font-bold tabular-nums ${metric.color}`}>{metric.value.toLocaleString()}</p>
            </div>
          ))}
          {showHeavy && (
            <div className="rounded-[4px] bg-cyan-50 p-4">
              <p className="mb-1 truncate text-xs text-slate-600">Heavy Vehicle Crashes</p>
              <p className="text-right text-2xl font-bold tabular-nums text-cyan-700">
                {stats.heavyVehicleKnown ? stats.heavyVehicleCrashes.toLocaleString() : "—"}
              </p>
              {heavyNote && <p className="mt-0.5 text-right text-[11px] text-slate-500">{heavyNote}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TONES = {
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  slate: "bg-slate-100 text-slate-700",
};

function Insight({ value, title, detail, tone }: { value: string; title: string; detail: string; tone: keyof typeof TONES }) {
  return (
    <div className="flex items-center gap-4">
      <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}>
        <span className="text-lg font-bold">{value}</span>
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}
