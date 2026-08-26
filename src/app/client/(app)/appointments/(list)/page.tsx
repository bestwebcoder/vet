import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppointmentList } from "@/components/appointments/appointment-list";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listAppointments, listAppointmentStatuses } from "@/features/appointments/queries";
import { getOwnClientRecord } from "@/features/clients/queries";

export const metadata: Metadata = { title: "Appointments · TV Care" };

export default async function ClientAppointmentsPage() {
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

  const [upcoming, past, statuses] = await Promise.all([
    listAppointments({ clientId, from: now, excludeStatuses: ["cancelled", "no_show"], order: "asc" }),
    listAppointments({ clientId, to: now, order: "desc", limit: 50 }),
    listAppointmentStatuses(),
  ]);

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
        <CardContent>
          {upcoming.status === "error" ? (
            <ErrorState title="Your upcoming appointments could not be loaded" />
          ) : (
            <AppointmentList
              appointments={upcoming.data}
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
        <CardContent>
          {past.status === "error" ? (
            <ErrorState title="Your past appointments could not be loaded" />
          ) : (
            <AppointmentList
              appointments={past.data}
              statuses={statuses}
              basePath="/client/appointments"
              audience="client"
              emptyTitle="No past appointments yet"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
