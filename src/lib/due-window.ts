import { format } from "date-fns";

/**
 * The one place the "30 days before / 7 days before / due today / overdue"
 * arithmetic happens (§6.5), so PetCard, both dashboards and the doctor/admin
 * worklists can never disagree about what "due soon" means. Mirrors how
 * `src/lib/dose.ts` centralised dose math in Phase 5.
 */

export type DueStatus = "none" | "upcoming" | "due_in_30" | "due_in_7" | "due_today" | "overdue";

export type DueInfo = {
  status: DueStatus;
  /** Negative once overdue, 0 on the due date, null when there is no date at all. */
  daysUntil: number | null;
  label: string;
};

function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getDueInfo(nextDueDate: string | null, today: Date = new Date()): DueInfo {
  if (!nextDueDate) {
    return { status: "none", daysUntil: null, label: "not scheduled yet" };
  }

  const due = startOfDay(new Date(`${nextDueDate}T00:00:00`));
  const start = startOfDay(today);
  const daysUntil = Math.round((due.getTime() - start.getTime()) / 86_400_000);

  if (daysUntil < 0) {
    const overdueDays = Math.abs(daysUntil);
    return {
      status: "overdue",
      daysUntil,
      label: `overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`,
    };
  }

  if (daysUntil === 0) {
    return { status: "due_today", daysUntil, label: "due today" };
  }

  if (daysUntil <= 7) {
    return { status: "due_in_7", daysUntil, label: `due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}` };
  }

  if (daysUntil <= 30) {
    return { status: "due_in_30", daysUntil, label: `due ${format(due, "d MMM yyyy")}` };
  }

  return { status: "upcoming", daysUntil, label: `due ${format(due, "d MMM yyyy")}` };
}

/** Which existing `Badge` variant reads as this due status, without a parallel colour system. */
export function dueStatusBadgeVariant(status: DueStatus): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "overdue":
      return "destructive";
    case "due_today":
    case "due_in_7":
      return "default";
    case "due_in_30":
      return "secondary";
    default:
      return "outline";
  }
}
