import type { NextRequest } from "next/server";

import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { getClientSummary } from "@/features/reports/queries";
import { reportExportResponse } from "@/lib/report-export";
import { readDateRange } from "@/lib/validation/date-range";

export async function GET(request: NextRequest) {
  const user = await requireRole("doctor");
  const doctor = await getOwnDoctorRecord();
  if (doctor.status !== "ok" || doctor.data?.canViewReports !== true) {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const range = readDateRange(Object.fromEntries(searchParams));
  const organizationId = user.organizationIds[0];
  if (!organizationId) return new Response("Not found", { status: 404 });

  const summary = await getClientSummary(organizationId, range);

  const sections = [
    {
      title: "Clients, by status",
      columns: ["Status", "Count"],
      rows:
        summary.status === "ok"
          ? [
              ["New", summary.data.newClients],
              ["Returning", summary.data.returningClients],
              ["Active", summary.data.activeClients],
            ]
          : [],
    },
  ];

  const format = searchParams.get("format");
  return reportExportResponse(format, "Client report", "client-report", range, organizationId, sections);
}
