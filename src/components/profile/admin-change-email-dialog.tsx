"use client";

import { useActionState, useState } from "react";
import { Mail } from "lucide-react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { adminChangeEmailAction } from "@/features/profile/actions";
import { idleState } from "@/lib/forms";

/** An admin changes someone's sign-in email — also what they use to sign in, so this replaces it immediately. */
export function AdminChangeEmailDialog({ targetUserId, targetName, email }: { targetUserId: string; targetName: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(adminChangeEmailAction, idleState);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Mail aria-hidden />
        Change email
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change {targetName}&rsquo;s email</DialogTitle>
          <DialogDescription>They will sign in with the new address immediately — tell them directly.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-5" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="targetUserId" value={targetUserId} />

          <Field
            label="New email"
            name="newEmail"
            type="email"
            inputMode="email"
            defaultValue={email}
            required
            errors={state.status === "error" ? state.fieldErrors?.newEmail : undefined}
          />

          <SubmitButton pendingLabel="Saving…">Change email</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
