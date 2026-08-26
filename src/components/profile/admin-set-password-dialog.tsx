"use client";

import { useActionState, useState } from "react";
import { KeyRound } from "lucide-react";

import { PasswordField } from "@/components/form/password-field";
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
import { adminSetPasswordAction } from "@/features/profile/actions";
import { idleState } from "@/lib/forms";

/** An admin sets a password directly for someone they administer — no current password, since it isn't them typing it. */
export function AdminSetPasswordDialog({ targetUserId, targetName }: { targetUserId: string; targetName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(adminSetPasswordAction, idleState);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <KeyRound aria-hidden />
        Set password
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set a password for {targetName}</DialogTitle>
          <DialogDescription>
            This replaces their password immediately. Share the new one with them directly — TV Care will not email it.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-5" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="targetUserId" value={targetUserId} />

          <PasswordField
            label="New password"
            name="newPassword"
            autoComplete="new-password"
            required
            hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number."
            errors={state.status === "error" ? state.fieldErrors?.newPassword : undefined}
          />

          <PasswordField
            label="Confirm new password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            errors={state.status === "error" ? state.fieldErrors?.confirmPassword : undefined}
          />

          <SubmitButton pendingLabel="Saving…">Set password</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
