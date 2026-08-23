import { format } from "date-fns";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { InvoiceDetail, InvoiceStatus } from "@/features/invoices/queries";

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Partially paid",
  paid: "Paid",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STATUS_BADGE_VARIANT: Record<InvoiceStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  issued: "secondary",
  partially_paid: "default",
  paid: "default",
  cancelled: "destructive",
  refunded: "destructive",
};

export function InvoiceList({ invoices, basePath }: { invoices: InvoiceDetail[]; basePath: string }) {
  if (invoices.length === 0) {
    return <p className="text-muted-foreground text-sm">No invoices match this filter.</p>;
  }

  return (
    <ul className="divide-border grid divide-y">
      {invoices.map((invoice) => (
        <li key={invoice.id}>
          <Link
            href={`${basePath}/${invoice.id}`}
            className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="grid flex-1 gap-0.5">
              <span className="text-sm font-medium" data-numeric>
                {invoice.invoiceNumber} · {invoice.clientName}
              </span>
              <span className="text-muted-foreground text-xs">
                {invoice.petName ? `${invoice.petName} · ` : ""}
                {invoice.issuedAt ? format(new Date(invoice.issuedAt), "d MMM yyyy") : "Not issued yet"}
              </span>
            </div>
            <span className="text-sm font-medium" data-numeric>
              {invoice.total}
            </span>
            <Badge variant={STATUS_BADGE_VARIANT[invoice.status]}>{STATUS_LABEL[invoice.status]}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
