import type { CrashStats } from "@/lib/crashes";
import { cardClass } from "./shared";

export function MetricCards({ stats, heavyNote }: { stats: CrashStats; heavyNote?: string | null }) {
  const metrics: { label: string; value: string; color: string; note?: string }[] = [
    { label: "Total Crashes", value: stats.totalCrashes.toLocaleString(), color: "text-[var(--color-primary)]" },
    { label: "Total Injuries", value: stats.totalInjuries.toLocaleString(), color: "text-orange-600" },
    { label: "Fatalities", value: stats.totalFatalities.toLocaleString(), color: "text-red-600" },
    { label: "Pedestrian Crashes", value: stats.pedestrianCrashes.toLocaleString(), color: "text-blue-700" },
    { label: "Bicycle Crashes", value: stats.bicycleCrashes.toLocaleString(), color: "text-green-700" },
    { label: "Hit & Run", value: stats.hitAndRunCount.toLocaleString(), color: "text-purple-700" },
  ];
  // heavyNote is null when the dataset has no CCRPC fields, "" when the date range is fully covered.
  if (heavyNote !== null && heavyNote !== undefined) {
    metrics.push({
      label: "Heavy Vehicle Crashes",
      value: stats.heavyVehicleKnown ? stats.heavyVehicleCrashes.toLocaleString() : "—",
      color: "text-cyan-700",
      note: heavyNote || undefined,
    });
  }

  return (
    <div className={`grid grid-cols-2 gap-4 md:grid-cols-4 ${metrics.length > 6 ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}>
      {metrics.map((metric) => (
        <div key={metric.label} className={`${cardClass} p-4`}>
          <p className="text-sm text-slate-600">{metric.label}</p>
          <p className={`text-2xl font-bold tabular-nums ${metric.color}`}>{metric.value}</p>
          {metric.note && <p className="mt-0.5 text-[11px] text-slate-500">{metric.note}</p>}
        </div>
      ))}
    </div>
  );
}
