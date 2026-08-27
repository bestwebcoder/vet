import { Lock, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateInvoiceButton } from "@/components/invoices/create-invoice-button";
import { InvoiceDetailView } from "@/components/invoices/invoice-detail";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { getAppointment } from "@/features/appointments/queries";
import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { getInvoiceForAppointment, signedInvoicePdfUrl } from "@/features/invoices/queries";
import { listPaymentsForInvoice, listRefundsForInvoice } from "@/features/payments/queries";
import { listServices } from "@/features/services/queries";

export const metadata: Metadata = { title: "Invoice · TV Care" };

export default async function AppointmentInvoicePage({
  params,
}: PageProps<"/doctor/appointments/[appointmentId]/invoice">) {
  await requireRole("doctor");
  const { appointmentId } = await params;

  const appointmentResult = await getAppointment(appointmentId);
  if (appointmentResult.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState />
        </CardContent>
      </Card>
    );
  }
  if (!appointmentResult.data) notFound();
  const appointment = appointmentResult.data;

  const [existingResult, doctor] = await Promise.all([getInvoiceForAppointment(appointmentId), getOwnDoctorRecord()]);
  const canManageBilling = doctor.status === "ok" && doctor.data?.canManageBilling === true;

  const backLink = (
    <p className="text-muted-foreground text-sm">
      <Link href={`/doctor/appointments/${appointmentId}`} className="underline underline-offset-4">
        Back to appointment
      </Link>
    </p>
  );

  if (existingResult.status === "ok" && existingResult.data) {
    const invoice = existingResult.data;
    const [servicesResult, paymentsResult, refundsResult, pdfUrl] = await Promise.all([
      listServices(),
      listPaymentsForInvoice(invoice.id),
      listRefundsForInvoice(invoice.id),
      signedInvoicePdfUrl(invoice.pdfPath),
    ]);

    return (
      <div className="mx-auto grid w-full max-w-2xl gap-6">
        {backLink}
        <InvoiceDetailView
          invoice={invoice}
          services={servicesResult.status === "ok" ? servicesResult.data : []}
          payments={paymentsResult.status === "ok" ? paymentsResult.data : []}
          refunds={refundsResult.status === "ok" ? refundsResult.data : []}
          pdfUrl={pdfUrl}
          canEdit={canManageBilling}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        {backLink}
        <h1>Invoice — {appointment.petName}</h1>
      </div>

      {!canManageBilling ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Lock}
              title="You do not have billing access"
              description="Ask an administrator to grant you billing access from Admin → Billing before you can generate an invoice."
            />
          </CardContent>
        </Card>
      ) : appointment.status !== "completed" ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Receipt}
              title="This visit is not completed yet"
              description="An invoice can only be generated once the appointment's status is Completed."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={Receipt}
              title="No invoice yet for this visit"
              description="Generate one from the service this appointment booked — you can add more items and a discount afterward."
              action={<CreateInvoiceButton appointmentId={appointmentId} />}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
