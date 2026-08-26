import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PatientReportView } from "@/components/reports/patient-report-view";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { readDateRange } from "@/lib/validation/date-range";

export const metadata: Metadata = { title: "Patient reports · TV Care" };

export default async function DoctorPatientReportsPage({ searchParams }: PageProps<"/doctor/reports/patients">) {
  const user = await requireRole("doctor");
  const range = readDateRange(await searchParams);
  const organizationId = user.organizationIds[0];

  const doctor = await getOwnDoctorRecord();
  const canViewReports = doctor.status === "ok" && doctor.data?.canViewReports === true;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="text-muted-foreground text-sm">
          <Link href="/doctor/reports" className="underline underline-offset-4">
            Back to reports
          </Link>
        </p>
        <h1>Patient reports</h1>
      </div>

      {!canViewReports || !organizationId ? (
        <Card>
          <CardContent>
            {!organizationId ? (
              <ErrorState />
            ) : (
              <EmptyState
                icon={Lock}
                title="You do not have report access"
                description="Ask an administrator to grant you report access from Admin → Reports."
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <PatientReportView organizationId={organizationId} range={range} basePath="/doctor/reports/patients" />
      )}
    </div>
  );
}
