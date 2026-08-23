"use client";

import { useActionState, useState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cancelAppointmentAction } from "@/features/appointments/actions";
import { idleState } from "@/lib/forms";

export function CancelAppointmentDialog({
  appointmentId,
  triggerLabel = "Cancel appointment",
}: {
  appointmentId: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(cancelAppointmentAction, idleState);

  // Closing the dialog on success, without a synchronous setState in an effect.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="touch" />}>{triggerLabel}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this appointment?</DialogTitle>
          <DialogDescription>This cannot be undone. The slot will be released.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="appointmentId" value={appointmentId} />
          <TextAreaField label="Reason (optional)" name="cancellationReason" rows={2} />

          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Keep appointment
            </Button>
            <SubmitButton pendingLabel="Cancelling…">Cancel appointment</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
