import { format } from "date-fns";
import { Download, Printer } from "lucide-react";

import { CancelInvoiceButton } from "@/components/invoices/cancel-button";
import { InvoiceItemList } from "@/components/invoices/invoice-item-list";
import { InvoiceSummary } from "@/components/invoices/invoice-summary";
import { IssueInvoiceButton } from "@/components/invoices/issue-button";
import { RecordPaymentForm } from "@/components/invoices/record-payment-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InvoiceDetail as InvoiceDetailData, InvoiceStatus } from "@/features/invoices/queries";
import type { Payment } from "@/features/payments/queries";
import type { ServiceSummary } from "@/features/services/queries";

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

/** Read-only rendering of one invoice, with the write actions shown only when canEdit. */
export function InvoiceDetailView({
  invoice,
  services,
  payments,
  pdfUrl,
  canEdit,
}: {
  invoice: InvoiceDetailData;
  services: ServiceSummary[];
  payments: Payment[];
  pdfUrl: string | null;
  canEdit: boolean;
}) {
  const canRecordPayment = canEdit && (invoice.status === "issued" || invoice.status === "partially_paid");
  const canCancel = canEdit && invoice.status !== "paid" && invoice.status !== "cancelled" && invoice.status !== "refunded";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium" data-numeric>
            {invoice.invoiceNumber}
          </p>
          <p className="text-muted-foreground text-sm">
            {invoice.clientName}
            {invoice.petName ? ` · ${invoice.petName}` : ""}
          </p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[invoice.status]}>{STATUS_LABEL[invoice.status]}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground text-xs">Issued</p>
            <p data-numeric>{invoice.issuedAt ? format(new Date(invoice.issuedAt), "d MMM yyyy") : "Not issued yet"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Due date</p>
            <p data-numeric>{invoice.dueDate ? format(new Date(invoice.dueDate), "d MMM yyyy") : "—"}</p>
          </div>
          {invoice.notes ? (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground text-xs">Notes</p>
              <p>{invoice.notes}</p>
            </div>
          ) : null}
          {invoice.status === "cancelled" && invoice.cancellationReason ? (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground text-xs">Cancellation reason</p>
              <p>{invoice.cancellationReason}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <InvoiceItemList invoiceId={invoice.id} items={invoice.items} services={services} canEdit={canEdit && invoice.status === "draft"} />

      <InvoiceSummary invoice={invoice} canEdit={canEdit} />

      {pdfUrl ? (
        <div className="flex flex-wrap gap-3">
          <a href={pdfUrl} download className={buttonVariants({ variant: "outline", size: "touch" })}>
            <Download aria-hidden />
            Download PDF
          </a>
          <a href={pdfUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "touch" })}>
            <Printer aria-hidden />
            Print PDF
          </a>
        </div>
      ) : null}

      {canEdit && invoice.status === "draft" ? <IssueInvoiceButton invoiceId={invoice.id} /> : null}

      {invoice.status !== "draft" ? <RecordPaymentForm invoiceId={invoice.id} payments={payments} canEdit={canRecordPayment} /> : null}

      {canCancel ? <CancelInvoiceButton invoiceId={invoice.id} /> : null}
    </div>
  );
}
