"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { updateTextBlockAction } from "@/features/site-pages/actions";
import type { TextBlockContent } from "@/features/site-pages/queries";
import { idleState } from "@/lib/forms";

export function TextBlockEditor({ pageId, blockId, content }: { pageId: string; blockId: string; content: TextBlockContent }) {
  const [state, formAction] = useActionState(updateTextBlockAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-3" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="blockId" value={blockId} />

      <Field label="Heading" name="heading" defaultValue={content.heading ?? ""} errors={fieldErrors?.heading} />
      <TextAreaField label="Text" name="body" rows={4} defaultValue={content.body} errors={fieldErrors?.body} required />

      <SubmitButton pendingLabel="Saving…">Save block</SubmitButton>
    </form>
  );
}
