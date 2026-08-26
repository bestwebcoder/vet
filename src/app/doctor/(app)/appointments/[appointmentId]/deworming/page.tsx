import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DewormingList } from "@/components/deworming/deworming-list";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { getAppointment } from "@/features/appointments/queries";
import { requireRole } from "@/features/auth/session";
import { listDewormingForAppointment } from "@/features/deworming/queries";

export const metadata: Metadata = { title: "Deworming · TV Care" };

export default async function AppointmentDewormingPage({
  params,
}: PageProps<"/doctor/appointments/[appointmentId]/deworming">) {
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

  const recordsResult = await listDewormingForAppointment(appointmentId);
  const records = recordsResult.status === "ok" ? recordsResult.data : [];

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="grid gap-1">
        <p className="text-muted-foreground text-sm">
          <Link href={`/doctor/appointments/${appointmentId}`} className="underline underline-offset-4">
            Back to appointment
          </Link>
        </p>
        <h1>Deworming — {appointment.petName}</h1>
      </div>

      <DewormingList appointmentId={appointmentId} petId={appointment.petId} doctorId={appointment.doctorId} records={records} canEdit />
    </div>
  );
}
