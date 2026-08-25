"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { adminUpdateIdentityAction } from "@/features/profile/actions";
import { idleState } from "@/lib/forms";

/**
 * Bare form (no dialog chrome) for correcting someone's name or phone
 * number — embeddable wherever an "edit this person" surface already exists
 * (the doctor edit dialog), and reused with dialog chrome around it by
 * AdminEditIdentityDialog where no such surface exists yet (the team
 * roster).
 */
export function AdminIdentityForm({
  targetUserId,
  fullName,
  phone,
  onDone,
}: {
  targetUserId: string;
  fullName: string;
  phone: string | null;
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(adminUpdateIdentityAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") onDone?.();
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
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

      <SubmitButton pendingLabel="Saving…">Save name and phone</SubmitButton>
    </form>
  );
}
