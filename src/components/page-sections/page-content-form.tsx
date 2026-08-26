"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { updateSiteContentAction } from "@/features/site-content/actions";
import { idleState } from "@/lib/forms";

/**
 * One field, already resolved on the server.
 *
 * SiteContentField itself carries `defaultValue` as a *function* of the
 * practice name, and a function cannot be handed to a client component — so
 * the server calls it and passes the resulting string. That also keeps the
 * whole copy registry out of the client bundle.
 */
export type PageContentFieldView = {
  key: string;
  label: string;
  multiline: boolean;
  /** What is stored, or "" when this field has never been overridden. */
  value: string;
  /** Shown as a hint when nothing is stored, so an admin can see what the page says today. */
  defaultText: string;
};

/**
 * One page's headings and body text — the half of a page that isn't a card
 * list. Replaces the old "Public website content" editor, which put every
 * page's copy behind its own sub-menu on a separate screen from the card
 * lists those same pages render.
 *
 * Posts `page` alongside the values: the action scopes itself to that page's
 * fields, because a blank field means "use the default" and is saved by
 * deleting its row.
 */
export function PageContentForm({ page, fields }: { page: string; fields: PageContentFieldView[] }) {
  const [state, formAction] = useActionState(updateSiteContentAction, idleState);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="page" value={page} />

      {fields.map((field) => (
        <TextAreaField
          key={field.key}
          label={field.label}
          name={field.key}
          rows={field.multiline ? 4 : 2}
          defaultValue={field.value}
          hint={field.value ? undefined : field.defaultText ? `Default: “${field.defaultText}”` : "Nothing shows unless you fill this in."}
        />
      ))}

      <SubmitButton pendingLabel="Saving…">Save page content</SubmitButton>
    </form>
  );
}
