import { format } from "date-fns";
import { CalendarClock } from "lucide-react";
import Link from "next/link";

import { AppointmentStatusBadge } from "@/components/appointments/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import type { AppointmentStatus, AppointmentSummary } from "@/features/appointments/queries";
import { VISIT_TYPE_LABELS, type VisitType } from "@/lib/validation/appointment";

type Audience = "client" | "doctor" | "admin";

const AUDIENCE_SUBTITLE: Record<Audience, (appointment: AppointmentSummary) => string> = {
  client: (appointment) => `${appointment.doctorName} · ${appointment.petName}`,
  doctor: (appointment) => `${appointment.clientName} · ${appointment.petName}`,
  admin: (appointment) => `${appointment.doctorName} · ${appointment.clientName} · ${appointment.petName}`,
};

export function AppointmentList({
  appointments,
  statuses,
  basePath,
  audience,
  emptyTitle = "No appointments",
  emptyDescription,
  emptyAction,
}: {
  appointments: AppointmentSummary[];
  statuses: AppointmentStatus[];
  basePath: string;
  audience: Audience;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  if (appointments.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <ul className="divide-border grid divide-y">
      {appointments.map((appointment) => (
        <li key={appointment.id}>
          <Link
            href={`${basePath}/${appointment.id}`}
            className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="grid flex-1 gap-0.5">
              <span className="text-sm font-medium" data-numeric>
                {format(new Date(appointment.startsAt), "d MMM yyyy · h:mm a")}
              </span>
              <span className="text-muted-foreground text-sm">
                {AUDIENCE_SUBTITLE[audience](appointment)}
              </span>
              <span className="text-muted-foreground text-sm">
                {VISIT_TYPE_LABELS[appointment.visitType as VisitType] ?? appointment.visitType} ·{" "}
                {appointment.serviceName}
              </span>
            </div>

            <AppointmentStatusBadge status={appointment.status} statuses={statuses} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
