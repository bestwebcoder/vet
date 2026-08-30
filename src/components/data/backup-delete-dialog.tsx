"use client";

import { Trash2 } from "lucide-react";
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
import { deleteBackupFileAction } from "@/features/data/actions";
import { idleState } from "@/lib/forms";

/**
 * Deletes the stored archive for one backup.
 *
 * Worth a confirmation rather than a single click: this is the practice's own
 * copy of its clinical record, and whether another copy exists is something
 * only the person at the screen knows.
 */
export function BackupDeleteDialog({ exportId, takenAt }: { exportId: string; takenAt: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteBackupFileAction, idleState);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" />}
      >
        <Trash2 aria-hidden />
        <span className="sr-only sm:not-sr-only">Delete</span>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this backup file?</DialogTitle>
          <DialogDescription>
            The archive taken on {takenAt} will be deleted from this practice&rsquo;s storage. Anyone who
            already downloaded it keeps their copy, and the line recording that this backup was taken —
            with its row count and checksum — stays in the history below.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="exportId" value={exportId} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full sm:w-auto"
              onClick={() => setOpen(false)}
            >
              Keep it
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Deleting…" className="w-full sm:w-auto">
              Delete file
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
