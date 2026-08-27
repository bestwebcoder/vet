import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppointmentList } from "@/components/appointments/appointment-list";
import { Pagination } from "@/components/search/pagination";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listAppointments, listAppointmentStatuses } from "@/features/appointments/queries";
import { getOwnClientRecord } from "@/features/clients/queries";

export const metadata: Metadata = { title: "Appointments · TV Care" };

/** Upcoming and past each page independently, so moving one leaves the other alone. */
const PAGE_SIZE = 25;

export default async function ClientAppointmentsPage({ searchParams }: PageProps<"/client/appointments">) {
  await requireRole("client");

  const client = await getOwnClientRecord();

  if (client.status === "error" || !client.data) {
    return (
      <Card>
        <CardContent>
          <ErrorState
            title="We could not load your appointments"
            description="Your client record could not be found. Please contact your clinic."
          />
        </CardContent>
      </Card>
    );
  }

  const clientId = client.data.id;
  const now = new Date().toISOString();

  const { upcomingPage: upcomingParam, pastPage: pastParam } = await searchParams;
  const upcomingPage = typeof upcomingParam === "string" ? Math.max(1, Number(upcomingParam) || 1) : 1;
  const pastPage = typeof pastParam === "string" ? Math.max(1, Number(pastParam) || 1) : 1;

  const [upcoming, past, statuses] = await Promise.all([
    listAppointments({ clientId, from: now, excludeStatuses: ["cancelled", "no_show"], order: "asc" }),
    listAppointments({ clientId, to: now, order: "desc" }),
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
        <Link href="/client/appointments/new" className={buttonVariants({ size: "touch" })}>
          <Plus aria-hidden />
          Book appointment
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {upcoming.status === "error" ? (
            <ErrorState title="Your upcoming appointments could not be loaded" />
          ) : (
            <AppointmentList
              appointments={upcomingRows.slice((upcomingCurrent - 1) * PAGE_SIZE, (upcomingCurrent - 1) * PAGE_SIZE + PAGE_SIZE)}
              statuses={statuses}
              basePath="/client/appointments"
              audience="client"
              emptyTitle="No upcoming appointments"
              emptyDescription="Book an appointment for your pet."
              emptyAction={
                <Link
                  href="/client/appointments/new"
                  className={buttonVariants({ size: "touch", className: "w-full" })}
                >
                  Book appointment
                </Link>
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Past</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {past.status === "error" ? (
            <ErrorState title="Your past appointments could not be loaded" />
          ) : (
            <AppointmentList
              appointments={pastRows.slice((pastCurrent - 1) * PAGE_SIZE, (pastCurrent - 1) * PAGE_SIZE + PAGE_SIZE)}
              statuses={statuses}
              basePath="/client/appointments"
              audience="client"
              emptyTitle="No past appointments yet"
            />
          )}
          <Pagination
            basePath="/client/appointments"
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
