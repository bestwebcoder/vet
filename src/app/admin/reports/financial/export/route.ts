import type { NextRequest } from "next/server";

import { requireRole } from "@/features/auth/session";
import { getRevenueByDoctor, getRevenueByService, getRevenueSeries, getRevenueTotals } from "@/features/reports/queries";
import { formatCurrency } from "@/lib/currency";
import { reportExportResponse } from "@/lib/report-export";
import { readDateRange } from "@/lib/validation/date-range";

export async function GET(request: NextRequest) {
  const user = await requireRole("admin", "super_admin");
  const { searchParams } = new URL(request.url);
  const range = readDateRange(Object.fromEntries(searchParams));
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return new Response("Not found", { status: 404 });
  }

  const [series, totals, byService, byDoctor] = await Promise.all([
    getRevenueSeries(organizationId, range, "day"),
    getRevenueTotals(organizationId, range),
    getRevenueByService(organizationId, range),
    getRevenueByDoctor(organizationId, range),
  ]);

  const sections = [
    {
      title: "Revenue collected, by day",
      columns: ["Date", "Revenue"],
      rows: series.status === "ok" ? series.data.map((row) => [row.periodStart, formatCurrency(row.revenuePaisa)]) : [],
    },
    {
      title: "Outstanding vs. paid invoices",
      columns: ["Status", "Invoices", "Amount"],
      rows:
        totals.status === "ok"
          ? [
              ["Outstanding", totals.data.outstandingCount, formatCurrency(totals.data.outstandingPaisa)],
              ["Paid", totals.data.paidCount, formatCurrency(totals.data.paidPaisa)],
            ]
          : [],
    },
    {
      title: "Revenue by service",
      columns: ["Service", "Quantity", "Revenue"],
      rows: byService.status === "ok" ? byService.data.map((row) => [row.serviceName, row.quantity, formatCurrency(row.revenuePaisa)]) : [],
    },
    {
      title: "Revenue by doctor",
      columns: ["Doctor", "Revenue"],
      rows: byDoctor.status === "ok" ? byDoctor.data.map((row) => [row.doctorName, formatCurrency(row.revenuePaisa)]) : [],
    },
  ];

  const format = searchParams.get("format");
  return reportExportResponse(format, "Financial report", "financial-report", range, organizationId, sections);
}
