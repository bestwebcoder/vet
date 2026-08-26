"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { PasswordField } from "@/components/form/password-field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginAction, type FormState } from "@/features/auth/actions";

const initialState: FormState = { status: "idle" };

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access your pets, records and appointments.</CardDescription>
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

          <div className="grid gap-2">
            <PasswordField
              label="Password"
              name="password"
              autoComplete="current-password"
              required
              errors={fieldErrors?.password}
            />
            <Link
              href="/forgot-password"
              className="text-muted-foreground justify-self-start text-sm underline underline-offset-4"
            >
              Forgot your password?
            </Link>
          </div>

          <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
