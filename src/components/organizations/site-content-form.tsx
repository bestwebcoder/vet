"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SITE_CONTENT_FIELDS, siteContentValue, type SiteContentField } from "@/features/site-content/fields";
import { updateSiteContentAction } from "@/features/site-content/actions";
import { idleState } from "@/lib/forms";

function groupByPage(fields: SiteContentField[]) {
  const groups = new Map<SiteContentField["page"], SiteContentField[]>();

  for (const field of fields) {
    if (!groups.has(field.page)) groups.set(field.page, []);
    groups.get(field.page)!.push(field);
  }

  return [...groups.entries()];
}

/** Admin editor for the copy shown on the public marketing site. Every field falls back to a sensible default when left blank. */
export function SiteContentForm({
  content,
  practiceName,
}: {
  content: Record<string, string>;
  practiceName: string;
}) {
  const [state, formAction] = useActionState(updateSiteContentAction, idleState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Public website content</CardTitle>
        <CardDescription>
          The headline and body text shown on the Home, About, Services and Contact pages. Leave a field blank
          to use its default text.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-6" noValidate>
          <FormAlert state={state} />

          {groupByPage(SITE_CONTENT_FIELDS).map(([page, fields]) => (
            <div key={page} className="grid gap-4">
              <p className="text-sm font-medium tracking-wide uppercase">{page}</p>
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

          <SubmitButton pendingLabel="Saving…">Save website content</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
