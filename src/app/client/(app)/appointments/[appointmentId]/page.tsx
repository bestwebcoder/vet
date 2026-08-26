import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppointmentStatusBadge } from "@/components/appointments/status-badge";
import { CancelAppointmentDialog } from "@/components/appointments/cancel-dialog";
import { RescheduleDialog } from "@/components/appointments/reschedule-dialog";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import {
  getAppointment,
  listAppointmentStatuses,
  mayClientChangeAppointment,
} from "@/features/appointments/queries";
import { VISIT_TYPE_LABELS, type VisitType } from "@/lib/validation/appointment";

export const metadata: Metadata = { title: "Appointment · TV Care" };

export default async function ClientAppointmentDetailPage({
  params,
}: PageProps<"/client/appointments/[appointmentId]">) {
  await requireRole("client");
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

  // Policy returns nothing for an appointment this client may not reach,
  // which is indistinguishable from one that does not exist — as it should be.
  if (!result.data) notFound();

  const appointment = result.data;
  const [statuses, mayChange] = await Promise.all([
    listAppointmentStatuses(),
    mayClientChangeAppointment(appointment.startsAt, appointment.organizationId),
  ]);

  const canManage = mayChange && ["requested", "confirmed"].includes(appointment.status);

  const details: { label: string; value: string }[] = [
    { label: "Pet", value: appointment.petName },
    { label: "Doctor", value: appointment.doctorName },
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
          <Link href="/client/appointments" className="underline underline-offset-4">
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
          <CardTitle className="text-base">Details</CardTitle>
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

      {canManage ? (
        <div className="flex flex-wrap gap-3">
          <RescheduleDialog
            appointmentId={appointment.id}
            doctorId={appointment.doctorId}
            serviceId={appointment.serviceId}
            visitType={appointment.visitType}
            currentStartsAt={appointment.startsAt}
          />
          <CancelAppointmentDialog appointmentId={appointment.id} />
        </div>
      ) : ["requested", "confirmed"].includes(appointment.status) ? (
        <p className="text-muted-foreground text-sm">
          This is too close to the appointment time to change online. Please contact your clinic.
        </p>
      ) : null}
    </div>
  );
}
