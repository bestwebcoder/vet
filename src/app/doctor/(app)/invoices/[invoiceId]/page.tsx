import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoiceDetailView } from "@/components/invoices/invoice-detail";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { getInvoice, signedInvoicePdfUrl } from "@/features/invoices/queries";
import { listPaymentsForInvoice, listRefundsForInvoice } from "@/features/payments/queries";
import { listServices } from "@/features/services/queries";

export const metadata: Metadata = { title: "Invoice · TV Care" };

export default async function DoctorInvoiceDetailPage({ params }: PageProps<"/doctor/invoices/[invoiceId]">) {
  await requireRole("doctor");
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
  const doctor = await getOwnDoctorRecord();
  const canEdit = doctor.status === "ok" && doctor.data?.canManageBilling === true;

  const [servicesResult, paymentsResult, refundsResult, pdfUrl] = await Promise.all([
    listServices(),
    listPaymentsForInvoice(invoiceId),
    listRefundsForInvoice(invoiceId),
    signedInvoicePdfUrl(invoice.pdfPath),
  ]);

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <p className="text-muted-foreground text-sm">
        <Link href={`/doctor/appointments/${invoice.appointmentId}`} className="underline underline-offset-4">
          Back to appointment
        </Link>
      </p>

      {!canEdit ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Lock}
              title="You can view this invoice, but not change it"
              description="Only an administrator or a doctor granted billing access can edit invoices, add items, or record payments."
            />
          </CardContent>
        </Card>
      ) : null}

      <InvoiceDetailView
        invoice={invoice}
        services={servicesResult.status === "ok" ? servicesResult.data : []}
        payments={paymentsResult.status === "ok" ? paymentsResult.data : []}
        refunds={refundsResult.status === "ok" ? refundsResult.data : []}
        pdfUrl={pdfUrl}
        canEdit={canEdit}
      />
    </div>
  );
}
