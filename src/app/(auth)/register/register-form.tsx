"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { PasswordField } from "@/components/form/password-field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { registerAction, type FormState } from "@/features/auth/actions";

const initialState: FormState = { status: "idle" };

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, initialState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>For pet owners of The Traveling Vet.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5" noValidate>
          <FormAlert state={state} />

          <Field
            label="Full name"
            name="fullName"
            autoComplete="name"
            required
            errors={fieldErrors?.fullName}
          />

          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            errors={fieldErrors?.email}
          />

          <Field
            label="Mobile number"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            hint="For example 01712345678"
            errors={fieldErrors?.phone}
          />

          <PasswordField
            label="PIN"
            name="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="new-password"
            required
            hint="Exactly 6 digits (0-9)."
            errors={fieldErrors?.password}
          />

          <PasswordField
            label="Confirm PIN"
            name="confirmPassword"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="new-password"
            required
            errors={fieldErrors?.confirmPassword}
          />

          <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
