import { Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppointmentList } from "@/components/appointments/appointment-list";
import { SelectField } from "@/components/form/select-field";
import { ErrorState } from "@/components/states/error-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listAppointments, listAppointmentStatuses } from "@/features/appointments/queries";
import { listDoctors } from "@/features/doctors/queries";

export const metadata: Metadata = { title: "Appointments · TV Care" };

export default async function AdminAppointmentsPage({
  searchParams,
}: PageProps<"/admin/appointments">) {
  await requireRole("admin", "super_admin");
  const { doctorId: doctorIdParam } = await searchParams;
  const doctorId = typeof doctorIdParam === "string" && doctorIdParam ? doctorIdParam : undefined;

  const now = new Date().toISOString();

  const [upcoming, past, statuses, doctors] = await Promise.all([
    listAppointments({ doctorId, from: now, excludeStatuses: ["cancelled", "no_show"], order: "asc" }),
    listAppointments({ doctorId, to: now, order: "desc", limit: 50 }),
    listAppointmentStatuses(),
    listDoctors(),
  ]);

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Appointments</h1>
        <Link
          href="/admin/appointments/availability"
          className={buttonVariants({ variant: "outline", size: "touch" })}
        >
          <Settings2 aria-hidden />
          Manage availability
        </Link>
      </div>

      {doctors.status === "ok" && doctors.data.length > 0 ? (
        <form method="get" className="flex max-w-md items-end gap-3">
          <div className="flex-1">
            <SelectField
              label="Filter by doctor"
              name="doctorId"
              options={[
                { value: "", label: "All doctors" },
                ...doctors.data.map((doctor) => ({ value: doctor.id, label: doctor.fullName })),
              ]}
              defaultValue={doctorId ?? ""}
            />
          </div>
          <Button type="submit" variant="outline" size="touch">
            Filter
          </Button>
        </form>
      ) : null}

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
              basePath="/admin/appointments"
              audience="admin"
              emptyTitle="No upcoming appointments"
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
              basePath="/admin/appointments"
              audience="admin"
              emptyTitle="No past appointments yet"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
