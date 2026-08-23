"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrency } from "@/lib/currency";

/**
 * One reusable chart shape for every report — a labelled bar per row.
 * `ResponsiveContainer` is what makes this render sensibly on a phone
 * (§8.5's "charts render correctly on mobile"), not just on a wide screen.
 *
 * `format` is a plain string, not a function: every caller here is a server
 * component, and a function prop cannot cross the server/client boundary —
 * the formatting itself has to happen inside this client component.
 */
export function ReportBarChart({
  data,
  format = "number",
}: {
  data: { label: string; value: number }[];
  format?: "number" | "currency";
}) {
  const formatValue = format === "currency" ? formatCurrency : (value: number) => String(value);

  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">No data for this range.</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatValue} width={70} />
          <Tooltip formatter={(value) => formatValue(Number(value))} />
          <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
