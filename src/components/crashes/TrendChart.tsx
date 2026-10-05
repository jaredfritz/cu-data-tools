"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/lib/crashes";

export function formatPeriod(period: string, interval: "week" | "month"): string {
  const date = new Date(`${period.length === 7 ? `${period}-01` : period}T00:00:00`);
  return interval === "week"
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function TrendChart({ data, interval }: { data: TrendPoint[]; interval: "week" | "month" }) {
  if (data.length === 0) {
    return <div className="flex h-72 items-center justify-center text-slate-500">No trend data available</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={288}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="period"
          tickFormatter={(value: string) => formatPeriod(value, interval)}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: "#e5e7eb" }}
          minTickGap={24}
        />
        <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} allowDecimals={false} />
        <Tooltip
          labelFormatter={(value) => `${interval === "week" ? "Week of " : ""}${formatPeriod(String(value), interval)}`}
          contentStyle={{ backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "4px" }}
          labelStyle={{ fontWeight: "bold" }}
        />
        <Legend />
        <Area type="monotone" dataKey="crashes" name="Crashes" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
        <Area type="monotone" dataKey="injuries" name="Injuries" stroke="#f97316" fill="#f97316" fillOpacity={0.3} />
        <Area type="monotone" dataKey="fatalities" name="Fatalities" stroke="#dc2626" fill="#dc2626" fillOpacity={0.3} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
