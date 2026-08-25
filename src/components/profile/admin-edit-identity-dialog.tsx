"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { adminUpdateIdentityAction } from "@/features/profile/actions";
import { idleState } from "@/lib/forms";

/** An admin corrects someone's name or phone number. */
export function AdminEditIdentityDialog({
  targetUserId,
  fullName,
  phone,
}: {
  targetUserId: string;
  fullName: string;
  phone: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(adminUpdateIdentityAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Pencil aria-hidden />
        Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit {fullName}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-5" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="targetUserId" value={targetUserId} />

          <Field label="Full name" name="fullName" defaultValue={fullName} required errors={fieldErrors?.fullName} />

          <Field
            label="Mobile number"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={phone ?? ""}
            hint="For example 01712345678"
            errors={fieldErrors?.phone}
          />

          <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
