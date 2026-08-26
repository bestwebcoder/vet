import type { Metadata } from "next";
import Link from "next/link";

import { ClientReportView } from "@/components/reports/client-report-view";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { readDateRange } from "@/lib/validation/date-range";

export const metadata: Metadata = { title: "Client reports · TV Care" };

export default async function AdminClientReportsPage({ searchParams }: PageProps<"/admin/reports/clients">) {
  const user = await requireRole("admin", "super_admin");
  const range = readDateRange(await searchParams);
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
        <h1>Client reports</h1>
      </div>

      <ClientReportView organizationId={organizationId} range={range} basePath="/admin/reports/clients" />
    </div>
  );
}
