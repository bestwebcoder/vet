"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { updateColumnsBlockAction } from "@/features/site-pages/actions";
import type { ColumnsBlockContent } from "@/features/site-pages/queries";
import { idleState } from "@/lib/forms";

const MIN_COLUMNS = 2;
const MAX_COLUMNS = 4;

/** A simple feature grid — 2 to 4 columns, each an optional heading and a short paragraph. */
export function ColumnsBlockEditor({ pageId, blockId, content }: { pageId: string; blockId: string; content: ColumnsBlockContent }) {
  const [state, formAction] = useActionState(updateColumnsBlockAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const [items, setItems] = useState(content.items.length >= MIN_COLUMNS ? content.items : [...content.items, { heading: "", body: "" }, { heading: "", body: "" }].slice(0, Math.max(MIN_COLUMNS, content.items.length)));

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="blockId" value={blockId} />
      <input type="hidden" name="columnCount" value={items.length} />

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item, index) => (
          <div key={index} className="grid gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Column {index + 1}</p>
              {items.length > MIN_COLUMNS ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              ) : null}
            </div>
            <Field
              label="Heading"
              name={`column-${index}-heading`}
              defaultValue={item.heading ?? ""}
              errors={fieldErrors?.[`items.${index}.heading`]}
            />
            <TextAreaField
              label="Text"
              name={`column-${index}-body`}
              rows={3}
              defaultValue={item.body ?? ""}
              errors={fieldErrors?.[`items.${index}.body`]}
            />
          </div>
        ))}
      </div>

      {items.length < MAX_COLUMNS ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setItems((current) => [...current, { heading: "", body: "" }])}>
          Add column
        </Button>
      ) : null}

      <SubmitButton pendingLabel="Saving…">Save block</SubmitButton>
    </form>
  );
}
