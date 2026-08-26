import { Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppointmentList } from "@/components/appointments/appointment-list";
import { SelectField } from "@/components/form/select-field";
import { DateRangeFilter } from "@/components/search/date-range-filter";
import { Pagination } from "@/components/search/pagination";
import { ErrorState } from "@/components/states/error-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCESS } from "@/features/auth/access";
import { requireRole } from "@/features/auth/session";
import { listAppointmentsPaginated, listAppointmentStatuses } from "@/features/appointments/queries";
import { listDoctors } from "@/features/doctors/queries";

export const metadata: Metadata = { title: "Appointments · TV Care" };

export default async function AdminAppointmentsPage({
  searchParams,
}: PageProps<"/admin/appointments">) {
  await requireRole(...ACCESS.reception);
  const { doctorId: doctorIdParam, from, to, page: pageParam, upcomingPage: upcomingPageParam } = await searchParams;
  const doctorId = typeof doctorIdParam === "string" && doctorIdParam ? doctorIdParam : undefined;
  const from_ = typeof from === "string" ? from : undefined;
  const to_ = typeof to === "string" ? to : undefined;
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;
  const upcomingPage = typeof upcomingPageParam === "string" ? Number(upcomingPageParam) || 1 : 1;

  const now = new Date().toISOString();

  const [upcoming, past, statuses, doctors] = await Promise.all([
    listAppointmentsPaginated({
      doctorId,
      from: now,
      excludeStatuses: ["cancelled", "no_show"],
      order: "asc",
      page: upcomingPage,
      pageSize: 25,
    }),
    listAppointmentsPaginated({ doctorId, from: from_, to: to_, page }),
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
          {from_ ? <input type="hidden" name="from" value={from_} /> : null}
          {to_ ? <input type="hidden" name="to" value={to_} /> : null}
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
        <CardContent className="grid gap-4">
          {upcoming.status === "error" ? (
            <ErrorState title="Upcoming appointments could not be loaded" />
          ) : (
            <>
              <AppointmentList
                appointments={upcoming.data}
                statuses={statuses}
                basePath="/admin/appointments"
                audience="admin"
                emptyTitle="No upcoming appointments"
              />
              <Pagination
                basePath="/admin/appointments"
                searchParams={{
                  doctorId,
                  from: from_,
                  to: to_,
                  page: page > 1 ? String(page) : undefined,
                }}
                page={upcoming.page}
                pageSize={upcoming.pageSize}
                totalCount={upcoming.totalCount}
                pageParam="upcomingPage"
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Past</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <DateRangeFilter action="/admin/appointments" from={from_} to={to_} preserve={{ doctorId }} />

          {past.status === "error" ? (
            <ErrorState title="Past appointments could not be loaded" />
          ) : (
            <>
              <AppointmentList
                appointments={past.data}
                statuses={statuses}
                basePath="/admin/appointments"
                audience="admin"
                emptyTitle="No past appointments yet"
              />
              <Pagination
                basePath="/admin/appointments"
                searchParams={{
                  doctorId,
                  from: from_,
                  to: to_,
                  upcomingPage: upcomingPage > 1 ? String(upcomingPage) : undefined,
                }}
                page={past.page}
                pageSize={past.pageSize}
                totalCount={past.totalCount}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
