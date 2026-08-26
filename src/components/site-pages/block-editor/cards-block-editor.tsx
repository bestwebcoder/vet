"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { ImageCropField } from "@/components/media/image-crop-field";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { updateCardsBlockAction } from "@/features/site-pages/actions";
import type { CardsBlockContent, CardsBlockItem } from "@/features/site-pages/queries";
import { ICON_OPTIONS } from "@/lib/icons";
import { idleState } from "@/lib/forms";

const MAX_CARDS = 8;

const EMPTY_CARD: CardsBlockItem = { icon: ICON_OPTIONS[0].key, title: "", body: null, path: null, url: null };

/**
 * The card grid, as a block — the same thing the fixed pages' sections render,
 * so a custom page can build one too. Every card takes an icon, an optional
 * picture, a title and a short paragraph; the whole grid saves in one submit.
 */
export function CardsBlockEditor({ pageId, blockId, content }: { pageId: string; blockId: string; content: CardsBlockContent }) {
  const [state, formAction] = useActionState(updateCardsBlockAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const [items, setItems] = useState<CardsBlockItem[]>(content.items.length > 0 ? content.items : [EMPTY_CARD]);
  // Icons are Select-driven, so they need controlled state rather than a
  // defaultValue the way the plain text fields do.
  const [icons, setIcons] = useState<string[]>(() => items.map((item) => item.icon ?? ICON_OPTIONS[0].key));

  // React resets an action form's uncontrolled fields once the action
  // resolves, and they fall back to whatever `defaultValue` says at that
  // moment. Without this, that is the pre-save `items`, so a successful save
  // appears to blank every card. Re-seed from the server's new content as it
  // arrives, so the reset lands on the values that were actually saved.
  const [lastContent, setLastContent] = useState(content);
  if (content !== lastContent) {
    setLastContent(content);
    const next = content.items.length > 0 ? content.items : [EMPTY_CARD];
    setItems(next);
    setIcons(next.map((item) => item.icon ?? ICON_OPTIONS[0].key));
  }

  function addCard() {
    setItems((current) => [...current, EMPTY_CARD]);
    setIcons((current) => [...current, ICON_OPTIONS[0].key]);
  }

  function removeCard(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
    setIcons((current) => current.filter((_, i) => i !== index));
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="blockId" value={blockId} />
      <input type="hidden" name="cardCount" value={items.length} />

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item, index) => (
          <div key={index} className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Card {index + 1}</p>
              {items.length > 1 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeCard(index)}>
                  Remove
                </Button>
              ) : null}
            </div>

            <Field
              label="Title"
              name={`card-${index}-title`}
              required
              maxLength={80}
              defaultValue={item.title}
              errors={fieldErrors?.[`items.${index}.title`]}
            />

            <TextAreaField
              label="Text"
              name={`card-${index}-body`}
              rows={3}
              defaultValue={item.body ?? ""}
              errors={fieldErrors?.[`items.${index}.body`]}
            />

            <SelectField
              label="Icon"
              name={`card-${index}-icon`}
              options={ICON_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
              value={icons[index] ?? ICON_OPTIONS[0].key}
              onValueChange={(value) => setIcons((current) => current.map((icon, i) => (i === index ? value : icon)))}
              errors={fieldErrors?.[`items.${index}.icon`]}
            />

            <ImageCropField
              id={`card-${blockId}-${index}`}
              name={`card-${index}-image`}
              label="Picture (optional)"
              hint="Shown above the card's text. Leave unchanged to keep the current picture."
              errors={fieldErrors?.[`card-${index}-image`]}
              aspect={16 / 9}
              outputWidth={1200}
              outputHeight={675}
              previewUrl={item.url}
              previewAlt=""
            />

            {item.url ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`card-${index}-removeImage`} className="accent-primary size-4" />
                Remove the current picture
              </label>
            ) : null}
          </div>
        ))}
      </div>

      {items.length < MAX_CARDS ? (
        <Button type="button" variant="outline" size="sm" onClick={addCard}>
          Add card
        </Button>
      ) : null}

      <SubmitButton pendingLabel="Saving…">Save block</SubmitButton>
    </form>
  );
}
