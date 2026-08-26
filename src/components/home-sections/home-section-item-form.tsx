"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Plus } from "lucide-react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
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
import { createHomeSectionItemAction, updateHomeSectionItemAction } from "@/features/home-sections/actions";
import type { HomeSectionItem } from "@/features/home-sections/queries";
import { ICON_OPTIONS } from "@/lib/icons";
import { idleState } from "@/lib/forms";
import type { HomeSection } from "@/lib/validation/home-sections";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="touch" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** Shared add/edit dialog for one item in a home page section — icon field only shown when the section uses one. */
export function HomeSectionItemForm({
  mode,
  section,
  item,
  trigger,
}: {
  mode: "create" | "edit";
  section: HomeSection;
  item?: HomeSectionItem;
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const action = mode === "create" ? createHomeSectionItemAction : updateHomeSectionItemAction;
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
          trigger ?? (
            <Button type="button" variant={mode === "create" ? "outline" : "ghost"} size="sm">
              {mode === "create" ? (
                <>
                  <Plus aria-hidden />
                  Add item
                </>
              ) : (
                <>
                  <Pencil aria-hidden />
                  Edit
                </>
              )}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add item" : "Edit item"}</DialogTitle>
        </DialogHeader>
        <FormAlert state={state} />
        <form action={formAction} className="grid gap-4">
          {item ? <input type="hidden" name="itemId" value={item.id} /> : null}
          <input type="hidden" name="section" value={section} />

          <Field
            label="Title"
            name="title"
            required
            maxLength={80}
            defaultValue={item?.title}
            errors={fieldErrors?.title}
          />

          <TextAreaField
            label="Description"
            name="description"
            required
            rows={3}
            defaultValue={item?.description}
            errors={fieldErrors?.description}
          />

          {section === "how_it_works" ? null : (
            <SelectField
              label="Icon"
              name="icon"
              options={ICON_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
              value={icon}
              onValueChange={setIcon}
              errors={fieldErrors?.icon}
            />
          )}

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
