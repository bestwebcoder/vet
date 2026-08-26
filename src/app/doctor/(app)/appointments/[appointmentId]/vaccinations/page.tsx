import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { VaccinationList } from "@/components/vaccinations/vaccination-list";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { getAppointment } from "@/features/appointments/queries";
import { requireRole } from "@/features/auth/session";
import { listActiveSchedules } from "@/features/vaccination-schedules/queries";
import { listVaccinationsForAppointment } from "@/features/vaccinations/queries";

export const metadata: Metadata = { title: "Vaccinations · TV Care" };

export default async function AppointmentVaccinationsPage({
  params,
}: PageProps<"/doctor/appointments/[appointmentId]/vaccinations">) {
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

  const [recordsResult, schedulesResult] = await Promise.all([
    listVaccinationsForAppointment(appointmentId),
    listActiveSchedules(),
  ]);

  const records = recordsResult.status === "ok" ? recordsResult.data : [];
  const schedules = schedulesResult.status === "ok" ? schedulesResult.data : [];

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="grid gap-1">
        <p className="text-muted-foreground text-sm">
          <Link href={`/doctor/appointments/${appointmentId}`} className="underline underline-offset-4">
            Back to appointment
          </Link>
        </p>
        <h1>Vaccinations — {appointment.petName}</h1>
      </div>

      <VaccinationList
        appointmentId={appointmentId}
        petId={appointment.petId}
        doctorId={appointment.doctorId}
        records={records}
        schedules={schedules}
        canEdit
      />
    </div>
  );
}
