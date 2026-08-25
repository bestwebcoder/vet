import { format } from "date-fns";
import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DateRangeFilter } from "@/components/search/date-range-filter";
import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listPaymentsForOrg } from "@/features/payments/queries";
import type { PaymentInput } from "@/lib/validation/payment";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/validation/payment";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments · TV Care" };

export default async function AdminPaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  await requireRole("admin", "super_admin");

  const { method, from, to, page: pageParam } = await searchParams;
  const activeMethod = typeof method === "string" ? (method as PaymentInput["method"]) : undefined;
  const from_ = typeof from === "string" ? from : undefined;
  const to_ = typeof to === "string" ? to : undefined;
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;

  const result = await listPaymentsForOrg({ method: activeMethod, from: from_, to: to_, page });

  function methodHref(value: PaymentInput["method"] | "") {
    const params = new URLSearchParams();
    if (value) params.set("method", value);
    if (from_) params.set("from", from_);
    if (to_) params.set("to", to_);
    const query = params.toString();
    return query ? `/admin/payments?${query}` : "/admin/payments";
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Payments</h1>
        <p className="text-muted-foreground">Every payment recorded across the practice, newest first.</p>
      </div>

      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Link
              href={methodHref("")}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                !activeMethod ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
              )}
            >
              All
            </Link>
            {PAYMENT_METHODS.map((value) => (
              <Link
                key={value}
                href={methodHref(value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  activeMethod === value ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
                )}
              >
                {PAYMENT_METHOD_LABELS[value]}
              </Link>
            ))}
          </div>

          <DateRangeFilter action="/admin/payments" from={from_} to={to_} preserve={{ method: activeMethod }} />

          {result.status === "error" ? (
            <ErrorState title="Payments could not be loaded" />
          ) : result.data.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No payments match these filters"
              description="Payments recorded against an invoice will appear here."
            />
          ) : (
            <>
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
              <Pagination
                basePath="/admin/payments"
                searchParams={{ method: activeMethod, from: from_, to: to_ }}
                page={result.page}
                pageSize={result.pageSize}
                totalCount={result.totalCount}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
