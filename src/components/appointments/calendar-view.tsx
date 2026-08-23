import { eachDayOfInterval, format, isSameDay, isSameMonth, isToday } from "date-fns";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { AppointmentStatusBadge } from "@/components/appointments/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import type { AppointmentStatus, AppointmentSummary } from "@/features/appointments/queries";
import { VISIT_TYPE_LABELS, type VisitType } from "@/lib/validation/appointment";
import { statusDotClasses } from "@/lib/status-colour";
import { cn } from "@/lib/utils";

function calendarHref(basePath: string, view: string, date: Date) {
  return `${basePath}?view=${view}&date=${format(date, "yyyy-MM-dd")}`;
}

/** One appointment, with everything §3.7 asks the calendar to show. */
function CalendarEntry({
  appointment,
  statuses,
  detailBasePath,
}: {
  appointment: AppointmentSummary;
  statuses: AppointmentStatus[];
  detailBasePath: string;
}) {
  const isEmergency = appointment.visitType === "emergency";

  return (
    <Link
      href={`${detailBasePath}/${appointment.id}`}
      className="hover:bg-muted/50 focus-visible:ring-ring flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="w-16 shrink-0 text-sm font-medium" data-numeric>
        {format(new Date(appointment.startsAt), "h:mm a")}
      </span>

      <div className="grid flex-1 gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {isEmergency ? <AlertTriangle className="text-destructive size-3.5" aria-hidden /> : null}
          {appointment.clientName} · {appointment.petName}
          {appointment.speciesName ? ` (${appointment.speciesName})` : ""}
        </span>
        <span className="text-muted-foreground text-sm">
          {VISIT_TYPE_LABELS[appointment.visitType as VisitType] ?? appointment.visitType} ·{" "}
          {appointment.serviceName}
          {appointment.location ? ` · ${appointment.location}` : ""}
        </span>
      </div>

      <AppointmentStatusBadge status={appointment.status} statuses={statuses} />
    </Link>
  );
}

export function DayAgenda({
  date,
  appointments,
  statuses,
  detailBasePath,
}: {
  date: Date;
  appointments: AppointmentSummary[];
  statuses: AppointmentStatus[];
  detailBasePath: string;
}) {
  const dayAppointments = appointments
    .filter((appointment) => isSameDay(new Date(appointment.startsAt), date))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  if (dayAppointments.length === 0) {
    return <EmptyState title="No appointments" description="Nothing scheduled for this day." />;
  }

  return (
    <div className="grid gap-2">
      {dayAppointments.map((appointment) => (
        <CalendarEntry
          key={appointment.id}
          appointment={appointment}
          statuses={statuses}
          detailBasePath={detailBasePath}
        />
      ))}
    </div>
  );
}

export function WeekAgenda({
  weekStart,
  weekDays,
  appointments,
  statuses,
  detailBasePath,
  basePath,
}: {
  weekStart: Date;
  weekDays: Date[];
  appointments: AppointmentSummary[];
  statuses: AppointmentStatus[];
  detailBasePath: string;
  basePath: string;
}) {
  void weekStart;

  return (
    <div className="grid gap-6">
      {weekDays.map((day) => {
        const dayAppointments = appointments
          .filter((appointment) => isSameDay(new Date(appointment.startsAt), day))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

        return (
          <div key={day.toISOString()} className="grid gap-2">
            <Link
              href={calendarHref(basePath, "day", day)}
              className={cn(
                "text-sm font-medium underline-offset-4 hover:underline",
                isToday(day) && "text-primary",
              )}
            >
              {format(day, "EEEE, d MMMM")}
            </Link>
            {dayAppointments.length === 0 ? (
              <p className="text-muted-foreground pl-1 text-sm">No appointments</p>
            ) : (
              <div className="grid gap-2">
                {dayAppointments.map((appointment) => (
                  <CalendarEntry
                    key={appointment.id}
                    appointment={appointment}
                    statuses={statuses}
                    detailBasePath={detailBasePath}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MonthGrid({
  month,
  gridStart,
  gridEnd,
  appointments,
  statuses,
  basePath,
}: {
  month: Date;
  gridStart: Date;
  gridEnd: Date;
  appointments: AppointmentSummary[];
  statuses: AppointmentStatus[];
  basePath: string;
}) {
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="grid grid-cols-7 gap-1 sm:gap-2">
      {days.map((day) => {
        const dayAppointments = appointments.filter((appointment) =>
          isSameDay(new Date(appointment.startsAt), day),
        );
        const inMonth = isSameMonth(day, month);

        return (
          <Link
            key={day.toISOString()}
            href={calendarHref(basePath, "day", day)}
            className={cn(
              "focus-visible:ring-ring flex min-h-16 flex-col gap-1 rounded-lg border p-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none sm:min-h-24 sm:p-2",
              inMonth ? "hover:bg-muted/50" : "text-muted-foreground/50 border-transparent",
              isToday(day) && "border-primary",
            )}
          >
            <span data-numeric className={cn("font-medium", isToday(day) && "text-primary")}>
              {format(day, "d")}
            </span>
            {dayAppointments.length > 0 ? (
              <span className="flex flex-wrap gap-0.5">
                {dayAppointments.slice(0, 6).map((appointment) => {
                  const definition = statuses.find((status) => status.slug === appointment.status);
                  return (
                    <span
                      key={appointment.id}
                      className={cn("size-1.5 rounded-full sm:size-2", statusDotClasses(definition?.colour ?? ""))}
                      aria-hidden
                    />
                  );
                })}
                {dayAppointments.length > 6 ? (
                  <span className="text-muted-foreground text-[0.65rem]">+{dayAppointments.length - 6}</span>
                ) : null}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
