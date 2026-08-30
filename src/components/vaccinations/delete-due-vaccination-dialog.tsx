"use client";

import { useActionState, useState } from "react";

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
import { deleteVaccinationRecordAction } from "@/features/vaccinations/actions";
import { idleState } from "@/lib/forms";

/**
 * Removes one vaccination record from the practice-wide due list.
 *
 * A clinical record, so it asks first and says what it means: the entry stops
 * being counted as due because the record it came from is gone, and the pet's
 * previous vaccination — if there is one — becomes the latest again. The
 * record is soft-deleted and stays in the audit history (CLAUDE.md §6); it is
 * for the entry recorded against the wrong patient, not for tidying a
 * worklist.
 */
export function DeleteDueVaccinationDialog({
  vaccinationId,
  petName,
  vaccineName,
}: {
  vaccinationId: string;
  petName: string;
  vaccineName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteVaccinationRecordAction, idleState);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            aria-label={`Delete ${petName}'s ${vaccineName} record`}
          />
        }
      >
        Delete
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Delete {petName}&rsquo;s {vaccineName} record?
          </DialogTitle>
          <DialogDescription>
            This removes the vaccination itself, not just the reminder — {petName} stops appearing as due for it, and
            any earlier {vaccineName} record becomes the most recent again. It stays in the audit history, but it is a
            clinical record: delete it only if it was entered by mistake.
          </DialogDescription>
        </DialogHeader>
        <FormAlert state={state} />
        <form action={formAction}>
          <input type="hidden" name="vaccinationId" value={vaccinationId} />
          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Deleting…" className="sm:w-auto">
              Delete record
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
