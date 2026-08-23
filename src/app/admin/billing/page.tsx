import type { Metadata } from "next";
import Link from "next/link";

import { InvoiceList } from "@/components/billing/invoice-list";
import { BillingSettings } from "@/components/billing/billing-settings";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listDoctors } from "@/features/doctors/queries";
import { listInvoicesForOrg, type InvoiceStatus } from "@/features/invoices/queries";
import { getOwnOrganization } from "@/features/organizations/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing · TV Care" };

const STATUS_FILTERS: { value: InvoiceStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

export default async function AdminBillingPage({ searchParams }: PageProps<"/admin/billing">) {
  const user = await requireRole("admin", "super_admin");
  const { status } = await searchParams;
  const activeStatus = typeof status === "string" ? (status as InvoiceStatus) : undefined;

  const organizationId = user.organizationIds[0];

  const [invoicesResult, organizationResult, doctorsResult] = await Promise.all([
    listInvoicesForOrg(activeStatus),
    organizationId ? getOwnOrganization(organizationId) : Promise.resolve({ status: "ok" as const, data: null }),
    listDoctors(),
  ]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Billing</h1>
        <p className="text-muted-foreground">Every invoice across the practice, and who is allowed to manage them.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => (
              <Link
                key={filter.value}
                href={filter.value ? `/admin/billing?status=${filter.value}` : "/admin/billing"}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  (activeStatus ?? "") === filter.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground",
                )}
              >
                {filter.label}
              </Link>
            ))}
          </div>

          {invoicesResult.status === "error" ? (
            <ErrorState title="Invoices could not be loaded" />
          ) : (
            <InvoiceList invoices={invoicesResult.data} basePath="/admin/invoices" />
          )}
        </CardContent>
      </Card>

      {organizationId ? (
        <BillingSettings
          organizationId={organizationId}
          paymentInstructions={organizationResult.status === "ok" ? (organizationResult.data?.paymentInstructions ?? null) : null}
          doctors={doctorsResult.status === "ok" ? doctorsResult.data : []}
        />
      ) : null}
    </div>
  );
}
