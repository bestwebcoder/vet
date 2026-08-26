import { format } from "date-fns";
import { Download, Printer, Receipt } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnClientRecord } from "@/features/clients/queries";
import { listInvoicesForClient, signedInvoicePdfUrl, type InvoiceStatus } from "@/features/invoices/queries";

export const metadata: Metadata = { title: "Invoices · TV Care" };

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

export default async function ClientInvoicesPage() {
  await requireRole("client");

  const client = await getOwnClientRecord();

  if (client.status === "error" || !client.data) {
    return (
      <Card>
        <CardContent>
          <ErrorState
            title="We could not load your invoices"
            description="Your client record could not be found. Please contact your clinic."
          />
        </CardContent>
      </Card>
    );
  }

  const invoicesResult = await listInvoicesForClient(client.data.id);
  if (invoicesResult.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Your invoices could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  const pdfLinks = await Promise.all(invoicesResult.data.map((invoice) => signedInvoicePdfUrl(invoice.pdfPath)));

  return (
    <div className="grid gap-6">
      <h1>Invoices</h1>

      {invoicesResult.data.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={Receipt} title="No invoices yet" description="Invoices issued for your pets' visits will appear here." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {invoicesResult.data.map((invoice, index) => (
            <Card key={invoice.id}>
              <CardContent className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium" data-numeric>
                      {invoice.invoiceNumber}
                      {invoice.petName ? ` · ${invoice.petName}` : ""}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {invoice.issuedAt ? format(new Date(invoice.issuedAt), "d MMM yyyy") : "Not issued yet"}
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE_VARIANT[invoice.status]}>{STATUS_LABEL[invoice.status]}</Badge>
                </div>

                <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm" data-numeric>
                  <span>Total {invoice.total}</span>
                  <span>Paid {invoice.amountPaid}</span>
                  {invoice.balancePaisa > 0 ? <span className="text-destructive">Balance {invoice.balance}</span> : null}
                </div>

                {pdfLinks[index] ? (
                  <div className="flex flex-wrap gap-3 pt-2">
                    <a href={pdfLinks[index]!} download className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Download aria-hidden />
                      Download
                    </a>
                    <a
                      href={pdfLinks[index]!}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Printer aria-hidden />
                      Print
                    </a>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
