"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import type { SitePageSummary } from "@/features/site-pages/queries";
import { idleState, type FormState } from "@/lib/forms";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** One form for creating and editing a custom page's settings — title, URL, and where it shows up. */
export function SitePageForm({
  action,
  page,
  submitLabel = "Save",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  page?: SitePageSummary;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const [slug, setSlug] = useState(page?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(page));

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />

      {page ? <input type="hidden" name="pageId" value={page.id} /> : null}

      <Field
        label="Page title"
        name="title"
        required
        defaultValue={page?.title}
        errors={fieldErrors?.title}
        onChange={(event) => {
          if (!slugTouched) setSlug(slugify(event.target.value));
        }}
      />

      <Field
        label="URL"
        name="slug"
        required
        value={slug}
        onChange={(event) => {
          setSlugTouched(true);
          setSlug(slugify(event.target.value));
        }}
        hint={`Shown at yoursite.com/${slug || "your-page"}`}
        errors={fieldErrors?.slug}
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublished" defaultChecked={page?.isPublished ?? true} className="accent-primary size-4" />
        Published (visible to visitors)
      </label>
      <p className="text-muted-foreground -mt-2 text-sm">
        To add this page to the site menu, use Website → Navigation once it&rsquo;s published.
      </p>

      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
