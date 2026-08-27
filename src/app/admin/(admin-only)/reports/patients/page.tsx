import type { Metadata } from "next";
import Link from "next/link";

import { PatientReportView } from "@/components/reports/patient-report-view";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { readDateRange } from "@/lib/validation/date-range";

export const metadata: Metadata = { title: "Patient reports · TV Care" };

export default async function AdminPatientReportsPage({ searchParams }: PageProps<"/admin/reports/patients">) {
  const user = await requireRole("admin", "super_admin");
  const params = await searchParams;
  const range = readDateRange(params);
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return (
      <Card>
        <CardContent>
          <ErrorState />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="text-muted-foreground text-sm">
          <Link href="/admin/reports" className="underline underline-offset-4">
            Back to reports
          </Link>
        </p>
        <h1>Patient reports</h1>
      </div>

      <PatientReportView organizationId={organizationId} range={range} basePath="/admin/reports/patients" searchParams={params} />
    </div>
  );
}
