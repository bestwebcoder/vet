import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ClientReportView } from "@/components/reports/client-report-view";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { readDateRange } from "@/lib/validation/date-range";

export const metadata: Metadata = { title: "Client reports · TV Care" };

export default async function DoctorClientReportsPage({ searchParams }: PageProps<"/doctor/reports/clients">) {
  const user = await requireRole("doctor");
  const params = await searchParams;
  const range = readDateRange(params);
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
        <h1>Client reports</h1>
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
        <ClientReportView organizationId={organizationId} range={range} basePath="/doctor/reports/clients" />
      )}
    </div>
  );
}
