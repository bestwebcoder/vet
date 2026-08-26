"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Plus } from "lucide-react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { ImageCropField } from "@/components/media/image-crop-field";
import { SelectField } from "@/components/form/select-field";
import { TextAreaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createPageSectionItemAction, updatePageSectionItemAction } from "@/features/page-sections/actions";
import type { PageSectionItem } from "@/features/page-sections/queries";
import { ICON_OPTIONS } from "@/lib/icons";
import { idleState } from "@/lib/forms";
import type { SectionDefinition } from "@/lib/page-sections";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="touch" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** Shared add/edit dialog for one card in a page section — the icon field only appears when the section renders one. */
export function PageSectionItemForm({
  mode,
  page,
  section,
  item,
}: {
  mode: "create" | "edit";
  page: string;
  section: SectionDefinition;
  item?: PageSectionItem;
}) {
  const [open, setOpen] = useState(false);
  const action = mode === "create" ? createPageSectionItemAction : updatePageSectionItemAction;
  const [state, formAction] = useActionState(action, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const [icon, setIcon] = useState(item?.icon ?? ICON_OPTIONS[0].key);

  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={mode === "create" ? "outline" : "ghost"}
            size={mode === "create" ? "sm" : "icon-sm"}
            aria-label={mode === "edit" ? `Edit ${item?.title}` : undefined}
          />
        }
      >
        {mode === "create" ? (
          <>
            <Plus aria-hidden />
            Add item
          </>
        ) : (
          <Pencil className="size-4" aria-hidden />
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add item" : "Edit item"}</DialogTitle>
        </DialogHeader>
        <FormAlert state={state} />
        <form action={formAction} className="grid gap-4">
          {item ? <input type="hidden" name="itemId" value={item.id} /> : null}
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="section" value={section.key} />

          <Field label="Title" name="title" required maxLength={80} defaultValue={item?.title} errors={fieldErrors?.title} />

          <TextAreaField
            label="Description"
            name="description"
            required
            rows={3}
            defaultValue={item?.description}
            errors={fieldErrors?.description}
          />

          {section.usesIcon ? (
            <SelectField
              label="Icon"
              name="icon"
              options={ICON_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
              value={icon}
              onValueChange={setIcon}
              errors={fieldErrors?.icon}
            />
          ) : null}

          <ImageCropField
            id={`section-image-${item?.id ?? `new-${page}-${section.key}`}`}
            name="image"
            label="Picture (optional)"
            hint="Shown above the card's text. Crop to the 16:9 frame the cards use. Leave unchanged to keep the current picture."
            errors={fieldErrors?.image}
            aspect={16 / 9}
            outputWidth={1200}
            outputHeight={675}
            previewUrl={item?.imageUrl ?? null}
            previewAlt=""
          />

          {item?.imageUrl ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="removeImage" className="accent-primary size-4" />
              Remove the current picture
            </label>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SaveButton label={mode === "create" ? "Add item" : "Save"} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
