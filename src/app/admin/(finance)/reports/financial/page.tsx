import type { Metadata } from "next";
import Link from "next/link";

import { FinancialReportView } from "@/components/reports/financial-report-view";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireAccess } from "@/features/auth/access";
import { readDateRange } from "@/lib/validation/date-range";

export const metadata: Metadata = { title: "Financial reports · TV Care" };

export default async function AdminFinancialReportsPage({ searchParams }: PageProps<"/admin/reports/financial">) {
  const user = await requireAccess("finance");
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
        <h1>Financial reports</h1>
      </div>

      <FinancialReportView organizationId={organizationId} range={range} basePath="/admin/reports/financial" searchParams={params} />
    </div>
  );
}
