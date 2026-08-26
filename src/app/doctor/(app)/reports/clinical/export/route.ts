import type { NextRequest } from "next/server";

import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { getClinicalSummary, getCommonDiagnoses } from "@/features/reports/queries";
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

  const [summary, diagnoses] = await Promise.all([
    getClinicalSummary(organizationId, range),
    getCommonDiagnoses(organizationId, range, 10),
  ]);

  const sections = [
    {
      title: "Visits, by type",
      columns: ["Type", "Count"],
      rows:
        summary.status === "ok"
          ? [
              ["Consultations", summary.data.consultations],
              ["Follow-ups", summary.data.followUps],
              ["Emergencies", summary.data.emergencies],
              ["Vaccinations", summary.data.vaccinations],
              ["Deworming", summary.data.dewormings],
            ]
          : [],
    },
    {
      title: "Most common diagnoses",
      columns: ["Diagnosis", "Occurrences"],
      rows: diagnoses.status === "ok" ? diagnoses.data.map((row) => [row.description, row.occurrences]) : [],
    },
  ];

  const format = searchParams.get("format");
  return reportExportResponse(format, "Clinical report", "clinical-report", range, organizationId, sections);
}
