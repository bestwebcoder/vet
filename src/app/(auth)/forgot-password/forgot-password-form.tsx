"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requestPasswordResetAction, type FormState } from "@/features/auth/actions";

const initialState: FormState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your email address and we will send you a link to choose a new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5" noValidate>
          <FormAlert state={state} />

          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            errors={fieldErrors?.email}
          />

          <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
