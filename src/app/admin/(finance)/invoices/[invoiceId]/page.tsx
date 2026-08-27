import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoiceDetailView } from "@/components/invoices/invoice-detail";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { ACCESS } from "@/features/auth/access";
import { requireRole } from "@/features/auth/session";
import { getInvoice, signedInvoicePdfUrl } from "@/features/invoices/queries";
import { listPaymentsForInvoice, listRefundsForInvoice } from "@/features/payments/queries";
import { listServices } from "@/features/services/queries";

export const metadata: Metadata = { title: "Invoice · TV Care" };

export default async function AdminInvoiceDetailPage({ params }: PageProps<"/admin/invoices/[invoiceId]">) {
  await requireRole(...ACCESS.finance);
  const { invoiceId } = await params;

  const result = await getInvoice(invoiceId);
  if (result.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState />
        </CardContent>
      </Card>
    );
  }
  if (!result.data) notFound();

  const invoice = result.data;
  const [servicesResult, paymentsResult, refundsResult, pdfUrl] = await Promise.all([
    listServices(),
    listPaymentsForInvoice(invoiceId),
    listRefundsForInvoice(invoiceId),
    signedInvoicePdfUrl(invoice.pdfPath),
  ]);

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <p className="text-muted-foreground text-sm">
        <Link href="/admin/billing" className="underline underline-offset-4">
          Back to billing
        </Link>
      </p>
      <InvoiceDetailView
        invoice={invoice}
        services={servicesResult.status === "ok" ? servicesResult.data : []}
        payments={paymentsResult.status === "ok" ? paymentsResult.data : []}
        refunds={refundsResult.status === "ok" ? refundsResult.data : []}
        pdfUrl={pdfUrl}
        canEdit
      />
    </div>
  );
}
