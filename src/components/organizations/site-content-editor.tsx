"use client";

import { useActionState, useState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { SITE_CONTENT_FIELDS, siteContentValue, type SiteContentField } from "@/features/site-content/fields";
import { updateSiteContentAction } from "@/features/site-content/actions";
import { idleState } from "@/lib/forms";
import { cn } from "@/lib/utils";

function groupByPage(fields: SiteContentField[]) {
  const groups = new Map<SiteContentField["page"], SiteContentField[]>();

  for (const field of fields) {
    if (!groups.has(field.page)) groups.set(field.page, []);
    groups.get(field.page)!.push(field);
  }

  return [...groups.entries()];
}

const GROUPS = groupByPage(SITE_CONTENT_FIELDS);

/**
 * Admin editor for the copy shown on the public marketing site — the pages
 * as a sub-menu on the left, the selected page's fields on the right.
 *
 * Every field for every page stays mounted (just hidden via CSS for the
 * pages not selected), so switching pages is a client-only affair and the
 * whole thing still submits through updateSiteContentAction as one form,
 * same as before this was split into pages.
 */
export function SiteContentEditor({ content, practiceName }: { content: Record<string, string>; practiceName: string }) {
  const [state, formAction] = useActionState(updateSiteContentAction, idleState);
  const [activePage, setActivePage] = useState<SiteContentField["page"]>(GROUPS[0][0]);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />

      <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
        <nav className="flex gap-2 overflow-x-auto sm:sticky sm:top-4 sm:grid sm:self-start sm:overflow-visible" aria-label="Website page">
          {GROUPS.map(([page]) => (
            <button
              key={page}
              type="button"
              onClick={() => setActivePage(page)}
              aria-current={activePage === page || undefined}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium",
                activePage === page
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {page}
            </button>
          ))}
        </nav>

        <div className="grid gap-6">
          {GROUPS.map(([page, fields]) => (
            <div key={page} className={cn("grid gap-4", page !== activePage && "hidden")}>
              {fields.map((field) => (
                <TextAreaField
                  key={field.key}
                  label={field.label}
                  name={field.key}
                  rows={field.multiline ? 4 : 2}
                  defaultValue={content[field.key] ?? ""}
                  hint={!content[field.key] ? `Default: “${siteContentValue({}, field.key, practiceName)}”` : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <SubmitButton pendingLabel="Saving…">Save website content</SubmitButton>
    </form>
  );
}
