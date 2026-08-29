"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { deletePetAction } from "@/features/pets/actions";
import { idleState } from "@/lib/forms";

/**
 * A client's own way to remove a pet. There is no restore for them — only
 * clinic staff can undo it — so this confirms before submitting, the same as
 * cancelling an appointment.
 */
export function DeletePetDialog({ petId, petName }: { petId: string; petName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deletePetAction, idleState);
  const router = useRouter();

  // Closing the dialog and leaving the (now-deleted) pet's page on success,
  // without a synchronous setState in an effect.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") {
      setOpen(false);
      router.push("/client/pets");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="touch" />}>
        <Trash2 aria-hidden />
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {petName}?</DialogTitle>
          <DialogDescription>
            {petName} will no longer appear on your account. Their medical records stay with the
            clinic, so contact The Traveling Vet if you need this undone.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="petId" value={petId} />

          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Keep pet
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Deleting…">
              Delete pet
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
