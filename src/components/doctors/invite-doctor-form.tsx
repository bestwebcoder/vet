"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { inviteDoctorAction } from "@/features/doctors/actions";
import { idleState } from "@/lib/forms";

/** A real Supabase Auth invite — the doctor sets their own password from the emailed link. */
export function InviteDoctorForm({
  branches,
  onDone,
}: {
  branches: { id: string; name: string }[];
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(inviteDoctorAction, idleState);
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

      {branches.length > 1 ? (
        <SelectField
          label="Primary branch"
          name="primaryBranchId"
          options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
          placeholder="No preference"
        />
      ) : null}

      <Field
        label="Registration number"
        name="registrationNumber"
        hint="Bangladesh Veterinary Council registration number, if known."
        errors={fieldErrors?.registrationNumber}
      />
      <Field label="Specialization" name="specialization" errors={fieldErrors?.specialization} />
      <Field label="Qualifications" name="qualifications" errors={fieldErrors?.qualifications} />

      <SubmitButton pendingLabel="Sending invitation…">Send invitation</SubmitButton>
    </form>
  );
}
