"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resetPasswordAction, type FormState } from "@/features/auth/actions";

const initialState: FormState = { status: "idle" };

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>This replaces your old password immediately.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5" noValidate>
          <FormAlert state={state} />

          <Field
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number."
            errors={fieldErrors?.password}
          />

          <Field
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            errors={fieldErrors?.confirmPassword}
          />

          <SubmitButton pendingLabel="Saving…">Save new password</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
