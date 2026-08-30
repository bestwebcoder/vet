"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { PasswordField } from "@/components/form/password-field";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { addTeamMemberAction } from "@/features/team/actions";
import { idleState } from "@/lib/forms";
import { NO_ROLE, roleOptions, type RoleOption } from "@/lib/validation/team";

/**
 * The account is created here and works immediately — no invitation email to
 * wait for. The admin sets the first password and hands it over; the person
 * can change it from their own profile afterwards.
 */
export function AddTeamMemberForm({
  roles,
  onDone,
}: {
  /** Assignable roles, read from the database: the set is no longer fixed. */
  roles: RoleOption[];
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(addTeamMemberAction, idleState);
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
        hint="They sign in with this."
        errors={fieldErrors?.email}
      />
      <Field label="Mobile number" name="phone" type="tel" inputMode="tel" errors={fieldErrors?.phone} />
      <Field label="Job title" name="jobTitle" hint="Optional — e.g. Receptionist, Practice manager." errors={fieldErrors?.jobTitle} />

      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number. Give it to them yourself — they can change it from their profile."
        errors={fieldErrors?.password}
      />

      <PasswordField
        label="Confirm password"
        name="confirmPassword"
        autoComplete="new-password"
        required
        errors={fieldErrors?.confirmPassword}
      />

      <SelectField
        label="Role"
        name="role"
        options={roleOptions("No role yet", roles)}
        defaultValue={NO_ROLE}
        hint="Leave as “No role yet” to grant one later from the team list."
      />

      <SubmitButton pendingLabel="Saving…">Add user</SubmitButton>
    </form>
  );
}
