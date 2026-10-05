"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/lib/crashes";
import { formatPeriod } from "./TrendChart";

const SERIES = [
  { key: "crashes", name: "Crashes", color: "#3b82f6" },
  { key: "injuries", name: "Injuries", color: "#eab308" },
  { key: "fatalities", name: "Fatalities", color: "#dc2626" },
] as const;

export function TrendSparklines({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return <div className="py-8 text-center text-slate-500">No trend data available for this period</div>;
  }

  const totals = data.reduce(
    (acc, point) => ({
      crashes: acc.crashes + point.crashes,
      injuries: acc.injuries + point.injuries,
      fatalities: acc.fatalities + point.fatalities,
    }),
    { crashes: 0, injuries: 0, fatalities: 0 },
  );
  const avg = (value: number) => (Math.round((value / data.length) * 10) / 10).toLocaleString();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4 text-center">
        <Summary label="Avg/Month" value={avg(totals.crashes)} unit="crashes" className="bg-slate-50" />
        <Summary label="Avg/Month" value={avg(totals.injuries)} unit="injuries" className="bg-yellow-50 text-yellow-700" />
        <Summary label="Total" value={totals.fatalities.toLocaleString()} unit="fatalities" className="bg-red-50 text-red-600" />
      </div>

      {SERIES.filter((series) => series.key !== "fatalities" || totals.fatalities > 0).map((series) => (
        <div key={series.key}>
          <p className="mb-2 text-sm font-medium text-slate-700">{series.name}</p>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={`spark-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={series.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={series.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="period"
                  tickFormatter={(value: string) => formatPeriod(value, "month")}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis hide domain={[0, "auto"]} />
                <Tooltip
                  labelFormatter={(value) => formatPeriod(String(value), "month")}
                  contentStyle={{ border: "1px solid #e5e7eb", borderRadius: "4px", fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey={series.key}
                  stroke={series.color}
                  strokeWidth={2}
                  fill={`url(#spark-${series.key})`}
                  name={series.name}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}

function Summary({ label, value, unit, className }: { label: string; value: string; unit: string; className: string }) {
  return (
    <div className={`rounded-[4px] p-3 ${className}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-slate-500">{unit}</p>
    </div>
  );
}
