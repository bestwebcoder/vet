"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { updateSectionBlockAction } from "@/features/site-pages/actions";
import type { SectionBlockContent } from "@/features/site-pages/queries";
import { idleState } from "@/lib/forms";

/** A titled section — a heavier heading than the text block, meant to break a page into parts. */
export function SectionBlockEditor({ pageId, blockId, content }: { pageId: string; blockId: string; content: SectionBlockContent }) {
  const [state, formAction] = useActionState(updateSectionBlockAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-3" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="blockId" value={blockId} />

      <Field label="Section heading" name="heading" required defaultValue={content.heading} errors={fieldErrors?.heading} />
      <TextAreaField label="Body text (optional)" name="body" rows={3} defaultValue={content.body ?? ""} errors={fieldErrors?.body} />

      <SubmitButton pendingLabel="Saving…">Save block</SubmitButton>
    </form>
  );
}
