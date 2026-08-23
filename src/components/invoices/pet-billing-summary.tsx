import { format } from "date-fns";
import { Receipt } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listInvoicesForPet, type InvoiceStatus } from "@/features/invoices/queries";

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

/**
 * A pet's invoice history, newest first. Staff link to the full invoice
 * (doctor to their `/doctor/invoices` route, admin to `/admin/invoices`);
 * the client view is read-only.
 */
export async function PetBillingSummary({ petId, linkBasePath }: { petId: string; linkBasePath?: string }) {
  const result = await listInvoicesForPet(petId);

  if (result.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Invoices could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  if (result.data.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState icon={Receipt} title="No invoices yet" description="Invoices issued for this patient's visits will appear here." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="grid gap-3">
        {result.data.map((invoice) => {
          const content = (
            <div className="grid gap-1 rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium" data-numeric>
                  {invoice.invoiceNumber}
                </span>
                <Badge variant={STATUS_BADGE_VARIANT[invoice.status]}>{STATUS_LABEL[invoice.status]}</Badge>
              </div>
              <span className="text-muted-foreground text-xs" data-numeric>
                {invoice.issuedAt ? format(new Date(invoice.issuedAt), "d MMM yyyy") : "Not issued yet"} · {invoice.total}
              </span>
            </div>
          );

          return linkBasePath ? (
            <Link
              key={invoice.id}
              href={`${linkBasePath}/${invoice.id}`}
              className="focus-visible:ring-ring rounded-lg focus-visible:ring-2 focus-visible:outline-none"
            >
              {content}
            </Link>
          ) : (
            <div key={invoice.id}>{content}</div>
          );
        })}
      </CardContent>
    </Card>
  );
}
