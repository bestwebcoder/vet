import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppointmentList } from "@/components/appointments/appointment-list";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listAppointments, listAppointmentStatuses } from "@/features/appointments/queries";
import { getOwnDoctorRecord } from "@/features/doctors/queries";

export const metadata: Metadata = { title: "Appointments · TV Care" };

export default async function DoctorAppointmentsPage() {
  await requireRole("doctor");

  const doctor = await getOwnDoctorRecord();

  if (doctor.status === "error" || !doctor.data) {
    return (
      <Card>
        <CardContent>
          <ErrorState
            title="We could not load your appointments"
            description="Your doctor record could not be found. Please contact your administrator."
          />
        </CardContent>
      </Card>
    );
  }

  const doctorId = doctor.data.id;
  const now = new Date().toISOString();

  const [upcoming, past, statuses] = await Promise.all([
    listAppointments({ doctorId, from: now, excludeStatuses: ["cancelled", "no_show"], order: "asc" }),
    listAppointments({ doctorId, to: now, order: "desc", limit: 50 }),
    listAppointmentStatuses(),
  ]);

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Appointments</h1>
        <Link href="/doctor/calendar" className={buttonVariants({ variant: "outline", size: "touch" })}>
          <CalendarDays aria-hidden />
          Open calendar
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.status === "error" ? (
            <ErrorState title="Upcoming appointments could not be loaded" />
          ) : (
            <AppointmentList
              appointments={upcoming.data}
              statuses={statuses}
              basePath="/doctor/appointments"
              audience="doctor"
              emptyTitle="No upcoming appointments"
              emptyDescription="New bookings appear here as clients or reception schedule them."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Past</CardTitle>
        </CardHeader>
        <CardContent>
          {past.status === "error" ? (
            <ErrorState title="Past appointments could not be loaded" />
          ) : (
            <AppointmentList
              appointments={past.data}
              statuses={statuses}
              basePath="/doctor/appointments"
              audience="doctor"
              emptyTitle="No past appointments yet"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
