"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { submitContactMessageAction } from "@/features/contact/actions";
import { idleState } from "@/lib/forms";

export function ContactForm() {
  const [state, formAction] = useActionState(submitContactMessageAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  if (state.status === "success") {
    return (
      <div className="rounded-lg border p-6 text-center">
        <p className="font-medium">Message sent</p>
        <p className="text-muted-foreground mt-1 text-sm">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />
      <Field label="Your name" name="name" required errors={fieldErrors?.name} />
      <Field label="Email" name="email" type="email" inputMode="email" required errors={fieldErrors?.email} />
      <Field label="Phone (optional)" name="phone" type="tel" inputMode="tel" errors={fieldErrors?.phone} />
      <TextAreaField label="Message" name="message" rows={5} errors={fieldErrors?.message} required />
      <SubmitButton pendingLabel="Sending…">Send message</SubmitButton>
    </form>
  );
}
