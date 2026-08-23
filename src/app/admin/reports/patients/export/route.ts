import type { NextRequest } from "next/server";

import { requireRole } from "@/features/auth/session";
import { getFrequentPatients, getPatientSpeciesBreakdown } from "@/features/reports/queries";
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

  const [species, frequent] = await Promise.all([
    getPatientSpeciesBreakdown(organizationId, range),
    getFrequentPatients(organizationId, range, 10),
  ]);

  const sections = [
    {
      title: "New patients, by species",
      columns: ["Species", "Count"],
      rows: species.status === "ok" ? species.data.map((row) => [row.speciesName, row.count]) : [],
    },
    {
      title: "Most frequently visited patients",
      columns: ["Patient", "Visits"],
      rows: frequent.status === "ok" ? frequent.data.map((row) => [row.petName, row.visitCount]) : [],
    },
  ];

  const format = searchParams.get("format");
  return reportExportResponse(format, "Patient report", "patient-report", range, organizationId, sections);
}
