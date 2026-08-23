import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClipboardList, FileText } from "lucide-react";

import { AppointmentStatusBadge } from "@/components/appointments/status-badge";
import { AppointmentStatusActions } from "@/components/appointments/status-actions";
import { RescheduleDialog } from "@/components/appointments/reschedule-dialog";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getAppointment, listAppointmentStatuses } from "@/features/appointments/queries";
import { getCurrentPrescription } from "@/features/prescriptions/queries";
import { getCurrentSoapRecord } from "@/features/soap/queries";
import { VISIT_TYPE_LABELS, type VisitType } from "@/lib/validation/appointment";

export const metadata: Metadata = { title: "Appointment · TV Care" };

export default async function DoctorAppointmentDetailPage({
  params,
}: PageProps<"/doctor/appointments/[appointmentId]">) {
  await requireRole("doctor");
  const { appointmentId } = await params;

  const result = await getAppointment(appointmentId);

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

  const appointment = result.data;
  const [statuses, soapResult, prescriptionResult] = await Promise.all([
    listAppointmentStatuses(),
    getCurrentSoapRecord(appointmentId),
    getCurrentPrescription(appointmentId),
  ]);
  const isFinal = ["completed", "cancelled", "no_show"].includes(appointment.status);

  const soapLabel =
    soapResult.status === "ok" && soapResult.data
      ? soapResult.data.status === "finalized"
        ? "View SOAP record"
        : "Continue SOAP draft"
      : "Start SOAP record";

  const hasFinalizedSoap = soapResult.status === "ok" && soapResult.data?.status === "finalized";
  const prescriptionLabel =
    prescriptionResult.status === "ok" && prescriptionResult.data
      ? prescriptionResult.data.status === "finalized"
        ? "View prescription"
        : "Continue prescription draft"
      : "Start prescription";

  const details: { label: string; value: string }[] = [
    { label: "Client", value: `${appointment.clientName} · ${appointment.clientPhone}` },
    { label: "Service", value: appointment.serviceName },
    {
      label: "Visit type",
      value: VISIT_TYPE_LABELS[appointment.visitType as VisitType] ?? appointment.visitType,
    },
    { label: "Location", value: appointment.location ?? "Usual clinic location" },
    { label: "Reason", value: appointment.reason ?? "Not given" },
  ];

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <p className="text-muted-foreground text-sm">
          <Link href="/doctor/appointments" className="underline underline-offset-4">
            Back to appointments
          </Link>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 data-numeric>{format(new Date(appointment.startsAt), "d MMMM yyyy · h:mm a")}</h1>
          <AppointmentStatusBadge status={appointment.status} statuses={statuses} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <Link href={`/doctor/patients/${appointment.petId}`} className="underline underline-offset-4">
              {appointment.petName}
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label} className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground sm:mb-0.5">{detail.label}</dt>
                <dd className="text-right sm:text-left">{detail.value}</dd>
              </div>
            ))}
          </dl>

          {appointment.status === "cancelled" && appointment.cancelledAt ? (
            <p className="text-muted-foreground mt-4 text-sm">
              Cancelled {format(new Date(appointment.cancelledAt), "d MMM yyyy")}
              {appointment.cancellationReason ? ` — ${appointment.cancellationReason}` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/doctor/appointments/${appointment.id}/soap`}
          className={buttonVariants({ variant: "outline", size: "touch" })}
        >
          <ClipboardList aria-hidden />
          {soapLabel}
        </Link>
        {hasFinalizedSoap ? (
          <Link
            href={`/doctor/appointments/${appointment.id}/prescription`}
            className={buttonVariants({ variant: "outline", size: "touch" })}
          >
            <FileText aria-hidden />
            {prescriptionLabel}
          </Link>
        ) : null}
      </div>

      {!isFinal ? (
        <div className="grid gap-4">
          <AppointmentStatusActions appointmentId={appointment.id} status={appointment.status} />
          <div>
            <RescheduleDialog
              appointmentId={appointment.id}
              doctorId={appointment.doctorId}
              serviceId={appointment.serviceId}
              visitType={appointment.visitType}
              currentStartsAt={appointment.startsAt}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
