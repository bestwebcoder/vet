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
import { removeOwnPetAction } from "@/features/pets/actions";
import { idleState } from "@/lib/forms";

/**
 * Lets an owner take one of their own pets off their account.
 *
 * The button says Delete because that is what it does from where the owner is
 * standing: the pet leaves their portal. The description says what actually
 * happens underneath — the clinic keeps the medical history, and can put the
 * pet back — because promising a permanent erase this app deliberately cannot
 * perform would be the wrong thing to tell someone.
 */
export function PetRemoveDialog({ petId, petName }: { petId: string; petName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(removeOwnPetAction, idleState);

  // A removal ends on the pets list — the action redirects there itself, so
  // there is no success state to handle here. What is left is the refusal
  // (a pet with an appointment still booked), which the dialog shows in place.

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
            {petName} will be removed from your pets, along with their upcoming reminders. Their
            medical history stays with the clinic, who can put {petName} back if this was a
            mistake.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="petId" value={petId} />

          {/* Stacked on a phone, side by side from `sm` — where SubmitButton's
              full-width default would otherwise take the whole row and push
              the way out past the dialog's edge. */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full sm:w-auto"
              onClick={() => setOpen(false)}
            >
              Keep {petName}
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Deleting…" className="w-full sm:w-auto">
              Delete {petName}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
