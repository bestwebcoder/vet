"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { inviteTeamMemberAction } from "@/features/team/actions";
import { idleState } from "@/lib/forms";

const ROLE_OPTIONS = [
  { value: "none", label: "No role yet" },
  { value: "client", label: "Client" },
  { value: "doctor", label: "Doctor" },
  { value: "admin", label: "Admin" },
];

/** A real Supabase Auth invite — they set their own password from the emailed link. */
export function InviteTeamMemberForm({ onDone }: { onDone?: () => void }) {
  const [state, formAction] = useActionState(inviteTeamMemberAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") onDone?.();
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />

      <Field label="Full name" name="fullName" required errors={fieldErrors?.fullName} />
      <Field
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        required
        hint="The invitation to set a password is sent here."
        errors={fieldErrors?.email}
      />
      <Field label="Mobile number" name="phone" type="tel" inputMode="tel" errors={fieldErrors?.phone} />
      <Field label="Job title" name="jobTitle" hint="Optional — e.g. Receptionist, Practice manager." errors={fieldErrors?.jobTitle} />

      <SelectField
        label="Role"
        name="role"
        options={ROLE_OPTIONS}
        defaultValue="none"
        hint="Leave as “No role yet” to grant one later from the team list."
      />

      <SubmitButton pendingLabel="Sending invitation…">Send invitation</SubmitButton>
    </form>
  );
}
