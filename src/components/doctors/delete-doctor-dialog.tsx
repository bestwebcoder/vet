"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
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
import { deleteDoctorAction } from "@/features/doctors/actions";
import type { DoctorSummary } from "@/features/doctors/queries";
import { idleState } from "@/lib/forms";

/**
 * Removes a doctor record for good.
 *
 * Deactivate sits beside it and is the one an administrator almost always
 * wants: reversible, and it keeps every record the doctor wrote. This is for
 * the profile created by mistake, so the dialog says which is which rather
 * than leaving two similar-looking buttons to be told apart by guesswork.
 *
 * A doctor with any history cannot be deleted at all. That answer comes back
 * from the server naming what is holding the record — the dialog stays open to
 * show it, because it is the sentence the administrator needs.
 */
export function DeleteDoctorDialog({ doctor }: { doctor: DoctorSummary }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteDoctorAction, idleState);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" />
        }
      >
        <Trash2 className="size-4" aria-hidden />
        Delete
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {doctor.fullName}?</DialogTitle>
          <DialogDescription>
            This removes the doctor record and their working hours for good, and takes away their access to this
            practice. It only works for a profile with no appointments and no clinical records — a doctor who has
            seen a patient keeps everything they wrote, and should be deactivated instead. Their login itself is
            left alone.
          </DialogDescription>
        </DialogHeader>
        <FormAlert state={state} />
        <form action={formAction}>
          <input type="hidden" name="doctorId" value={doctor.id} />
          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Deleting…" className="sm:w-auto">
              Delete doctor
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
