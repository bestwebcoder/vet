import { Badge } from "@/components/ui/badge";
import type { AppointmentStatus } from "@/features/appointments/queries";
import { statusBadgeClasses } from "@/lib/status-colour";
import { cn } from "@/lib/utils";

export function AppointmentStatusBadge({
  status,
  statuses,
}: {
  status: string;
  statuses: AppointmentStatus[];
}) {
  const definition = statuses.find((candidate) => candidate.slug === status);

  return (
    <Badge className={cn(statusBadgeClasses(definition?.colour ?? ""), "border-0")}>
      {definition?.name ?? status}
    </Badge>
  );
}
