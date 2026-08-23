"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Button, type buttonVariants } from "@/components/ui/button";
import { updateAppointmentStatusAction } from "@/features/appointments/actions";
import { idleState } from "@/lib/forms";

type Variant = NonNullable<Parameters<typeof buttonVariants>[0]>["variant"];

const TRANSITIONS: Record<string, { status: string; label: string; variant?: Variant }[]> = {
  requested: [
    { status: "confirmed", label: "Confirm" },
    { status: "no_show", label: "Mark no-show", variant: "outline" },
    { status: "cancelled", label: "Cancel", variant: "destructive" },
  ],
  confirmed: [
    { status: "checked_in", label: "Check in" },
    { status: "no_show", label: "Mark no-show", variant: "outline" },
    { status: "cancelled", label: "Cancel", variant: "destructive" },
  ],
  checked_in: [{ status: "in_consultation", label: "Start consultation" }],
  in_consultation: [{ status: "completed", label: "Complete" }],
};

/** The next valid status transitions for staff — clients change status only by cancelling. */
export function AppointmentStatusActions({
  appointmentId,
  status,
}: {
  appointmentId: string;
  status: string;
}) {
  const [state, formAction] = useActionState(updateAppointmentStatusAction, idleState);
  const options = TRANSITIONS[status] ?? [];

  if (options.length === 0) return null;

  return (
    <form action={formAction} className="grid gap-3">
      <FormAlert state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.status}
            type="submit"
            name="status"
            value={option.status}
            variant={option.variant ?? "default"}
            size="touch"
          >
            {option.label}
          </Button>
        ))}
      </div>
    </form>
  );
}
