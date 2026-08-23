import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DayAgenda, MonthGrid, WeekAgenda } from "@/components/appointments/calendar-view";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listAppointments, listAppointmentStatuses } from "@/features/appointments/queries";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { parseDateOnly, todayInDhaka } from "@/lib/age";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendar · TV Care" };

const VIEWS = ["day", "week", "month"] as const;
type View = (typeof VIEWS)[number];

// Saturday–Thursday: the Bangladeshi work week this practice runs on.
const WEEK_STARTS_ON = 6 as const;

function href(view: View, date: Date) {
  return `/doctor/calendar?view=${view}&date=${format(date, "yyyy-MM-dd")}`;
}

function adjacent(view: View, anchor: Date, direction: 1 | -1) {
  if (view === "day") return direction === 1 ? addDays(anchor, 1) : subDays(anchor, 1);
  if (view === "week") return direction === 1 ? addWeeks(anchor, 1) : subWeeks(anchor, 1);
  return direction === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1);
}

export default async function DoctorCalendarPage({ searchParams }: PageProps<"/doctor/calendar">) {
  await requireRole("doctor");
  const { view: viewParam, date: dateParam } = await searchParams;

  const view: View = VIEWS.includes(viewParam as View) ? (viewParam as View) : "day";
  const anchor =
    typeof dateParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? parseDateOnly(dateParam)
      : todayInDhaka();

  const doctor = await getOwnDoctorRecord();

  if (doctor.status === "error" || !doctor.data) {
    return (
      <Card>
        <CardContent>
          <ErrorState
            title="We could not load your calendar"
            description="Your doctor record could not be found. Please contact your administrator."
          />
        </CardContent>
      </Card>
    );
  }

  let from: Date;
  let to: Date;
  let title: string;

  if (view === "day") {
    from = startOfDay(anchor);
    to = addDays(from, 1);
    title = format(anchor, "EEEE, d MMMM yyyy");
  } else if (view === "week") {
    from = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
    to = addDays(from, 7);
    title = `${format(from, "d MMM")} – ${format(subDays(to, 1), "d MMM yyyy")}`;
  } else {
    from = startOfWeek(startOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON });
    to = addDays(endOfWeek(endOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON }), 1);
    title = format(anchor, "MMMM yyyy");
  }

  const [result, statuses] = await Promise.all([
    listAppointments({
      doctorId: doctor.data.id,
      from: from.toISOString(),
      to: to.toISOString(),
      order: "asc",
      limit: 1000,
    }),
    listAppointmentStatuses(),
  ]);

  const appointments = result.status === "ok" ? result.data : [];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1>Calendar</h1>
        <div className="flex gap-1 rounded-lg border p-1">
          {VIEWS.map((candidate) => (
            <Link
              key={candidate}
              href={href(candidate, anchor)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm capitalize transition-colors",
                candidate === view ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {candidate}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={href(view, adjacent(view, anchor, -1))}
            className={buttonVariants({ variant: "outline", size: "icon" })}
            aria-label="Previous"
          >
            <ChevronLeft aria-hidden />
          </Link>
          <Link
            href={href(view, adjacent(view, anchor, 1))}
            className={buttonVariants({ variant: "outline", size: "icon" })}
            aria-label="Next"
          >
            <ChevronRight aria-hidden />
          </Link>
          <Link href={href(view, todayInDhaka())} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Today
          </Link>
        </div>
        <p className="font-medium">{title}</p>
      </div>

      {result.status === "error" ? (
        <ErrorState title="Appointments could not be loaded" />
      ) : view === "day" ? (
        <DayAgenda
          date={anchor}
          appointments={appointments}
          statuses={statuses}
          detailBasePath="/doctor/appointments"
        />
      ) : view === "week" ? (
        <WeekAgenda
          weekStart={from}
          weekDays={eachDayOfInterval({ start: from, end: subDays(to, 1) })}
          appointments={appointments}
          statuses={statuses}
          detailBasePath="/doctor/appointments"
          basePath="/doctor/calendar"
        />
      ) : (
        <MonthGrid
          month={anchor}
          gridStart={from}
          gridEnd={subDays(to, 1)}
          appointments={appointments}
          statuses={statuses}
          basePath="/doctor/calendar"
        />
      )}
    </div>
  );
}
