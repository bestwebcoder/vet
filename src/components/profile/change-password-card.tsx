"use client";

import { useActionState } from "react";

import { PasswordField } from "@/components/form/password-field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { changeOwnPasswordAction } from "@/features/profile/actions";
import { idleState } from "@/lib/forms";

/** Self-service password change — requires the current password, unlike an admin setting one for someone else. */
export function ChangePasswordCard() {
  const [state, formAction] = useActionState(changeOwnPasswordAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Password</CardTitle>
        <CardDescription>Change the password you sign in with.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5" noValidate>
          <FormAlert state={state} />

          <PasswordField
            label="Current password"
            name="currentPassword"
            autoComplete="current-password"
            required
            errors={fieldErrors?.currentPassword}
          />

          <PasswordField
            label="New password"
            name="newPassword"
            autoComplete="new-password"
            required
            hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number."
            errors={fieldErrors?.newPassword}
          />

          <PasswordField
            label="Confirm new password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            errors={fieldErrors?.confirmPassword}
          />

          <SubmitButton pendingLabel="Saving…">Change password</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
