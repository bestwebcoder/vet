import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppointmentList } from "@/components/appointments/appointment-list";
import { Pagination } from "@/components/search/pagination";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listAppointments, listAppointmentStatuses } from "@/features/appointments/queries";
import { getOwnDoctorRecord } from "@/features/doctors/queries";

export const metadata: Metadata = { title: "Appointments · TV Care" };

/** Upcoming and past each page independently, so moving one leaves the other alone. */
const PAGE_SIZE = 25;

export default async function DoctorAppointmentsPage({ searchParams }: PageProps<"/doctor/appointments">) {
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

  const { upcomingPage: upcomingParam, pastPage: pastParam } = await searchParams;
  const upcomingPage = typeof upcomingParam === "string" ? Math.max(1, Number(upcomingParam) || 1) : 1;
  const pastPage = typeof pastParam === "string" ? Math.max(1, Number(pastParam) || 1) : 1;

  const [upcoming, past, statuses] = await Promise.all([
    listAppointments({ doctorId, from: now, excludeStatuses: ["cancelled", "no_show"], order: "asc" }),
    listAppointments({ doctorId, to: now, order: "desc" }),
    listAppointmentStatuses(),
  ]);

  const upcomingRows = upcoming.status === "ok" ? upcoming.data : [];
  const pastRows = past.status === "ok" ? past.data : [];

  // A page beyond the end is clamped to the last one rather than rendered
  // blank: with a single page of results the control hides itself, so an
  // out-of-range ?page would otherwise be a dead end with no way back.
  const upcomingCurrent = Math.min(upcomingPage, Math.max(1, Math.ceil(upcomingRows.length / PAGE_SIZE)));
  const pastCurrent = Math.min(pastPage, Math.max(1, Math.ceil(pastRows.length / PAGE_SIZE)));

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
        <CardContent className="grid gap-4">
          {upcoming.status === "error" ? (
            <ErrorState title="Upcoming appointments could not be loaded" />
          ) : (
            <AppointmentList
              appointments={upcomingRows.slice((upcomingCurrent - 1) * PAGE_SIZE, (upcomingCurrent - 1) * PAGE_SIZE + PAGE_SIZE)}
              statuses={statuses}
              basePath="/doctor/appointments"
              audience="doctor"
              emptyTitle="No upcoming appointments"
              emptyDescription="New bookings appear here as clients or reception schedule them."
            />
          )}
          <Pagination
            basePath="/doctor/appointments"
            searchParams={{ pastPage: typeof pastParam === "string" ? pastParam : undefined }}
            page={upcomingCurrent}
            pageSize={PAGE_SIZE}
            totalCount={upcomingRows.length}
            pageParam="upcomingPage"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Past</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {past.status === "error" ? (
            <ErrorState title="Past appointments could not be loaded" />
          ) : (
            <AppointmentList
              appointments={pastRows.slice((pastCurrent - 1) * PAGE_SIZE, (pastCurrent - 1) * PAGE_SIZE + PAGE_SIZE)}
              statuses={statuses}
              basePath="/doctor/appointments"
              audience="doctor"
              emptyTitle="No past appointments yet"
            />
          )}
          <Pagination
            basePath="/doctor/appointments"
            searchParams={{ upcomingPage: typeof upcomingParam === "string" ? upcomingParam : undefined }}
            page={pastCurrent}
            pageSize={PAGE_SIZE}
            totalCount={pastRows.length}
            pageParam="pastPage"
          />
        </CardContent>
      </Card>
    </div>
  );
}
