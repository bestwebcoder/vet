import { format } from "date-fns";
import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listPaymentsForOrg } from "@/features/payments/queries";
import { PAYMENT_METHOD_LABELS } from "@/lib/validation/payment";

export const metadata: Metadata = { title: "Payments · TV Care" };

export default async function AdminPaymentsPage() {
  await requireRole("admin", "super_admin");

  const result = await listPaymentsForOrg();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Payments</h1>
        <p className="text-muted-foreground">Every payment recorded across the practice, newest first.</p>
      </div>

      <Card>
        <CardContent>
          {result.status === "error" ? (
            <ErrorState title="Payments could not be loaded" />
          ) : result.data.length === 0 ? (
            <EmptyState icon={Wallet} title="No payments recorded yet" description="Payments recorded against an invoice will appear here." />
          ) : (
            <ul className="divide-border grid divide-y">
              {result.data.map((payment) => (
                <li key={payment.id}>
                  <Link
                    href={`/admin/invoices/${payment.invoiceId}`}
                    className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="grid flex-1 gap-0.5">
                      <span className="text-sm font-medium" data-numeric>
                        {payment.invoiceNumber ?? "Unknown invoice"} · {payment.clientName ?? "Unknown client"}
                      </span>
                      <span className="text-muted-foreground text-xs" data-numeric>
                        {format(new Date(payment.paidAt), "d MMM yyyy · h:mm a")}
                        {payment.referenceNumber ? ` · Ref ${payment.referenceNumber}` : ""}
                      </span>
                    </div>
                    <span className="text-sm font-medium" data-numeric>
                      {payment.amount}
                    </span>
                    <Badge variant="secondary">{PAYMENT_METHOD_LABELS[payment.method]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
