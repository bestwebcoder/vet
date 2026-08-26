"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Plus } from "lucide-react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createNavMenuItemAction, updateNavMenuItemAction } from "@/features/nav-menu/actions";
import type { NavMenuItem } from "@/features/nav-menu/queries";
import { idleState } from "@/lib/forms";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="touch" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/**
 * Shared create/edit dialog for a nav item. Create mode also handles adding
 * a dropdown child (pass parentId) — same fields either way, just a
 * different hidden field and confirmation copy.
 */
export function NavItemDialog({
  mode,
  item,
  parentId = null,
  hrefSuggestions,
  trigger,
}: {
  mode: "create" | "edit";
  item?: NavMenuItem;
  parentId?: string | null;
  hrefSuggestions: { value: string; label: string }[];
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const action = mode === "create" ? createNavMenuItemAction : updateNavMenuItemAction;
  const [state, formAction] = useActionState(action, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  // Close on a successful submit, but only once per submission — state
  // stays "success" after that, so without this guard reopening the dialog
  // later would immediately close it again (setState during render, not an
  // effect, per https://react.dev/learn/you-might-not-need-an-effect).
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  const datalistId = `nav-href-options-${mode}-${item?.id ?? parentId ?? "top"}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button type="button" variant={mode === "create" ? "outline" : "ghost"} size="sm">
              {mode === "create" ? (
                <>
                  <Plus aria-hidden />
                  {parentId ? "Add dropdown item" : "Add menu item"}
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
          <DialogTitle>{mode === "create" ? "Add menu item" : "Edit menu item"}</DialogTitle>
          {mode === "create" && parentId ? (
            <DialogDescription>Shown in this item&rsquo;s dropdown.</DialogDescription>
          ) : null}
        </DialogHeader>
        <FormAlert state={state} />
        <form action={formAction} className="grid gap-4">
          {item ? <input type="hidden" name="itemId" value={item.id} /> : null}
          {mode === "create" && parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}

          <Field
            label="Label"
            name="label"
            required
            maxLength={40}
            defaultValue={item?.label}
            errors={fieldErrors?.label}
          />

          <Field
            label="Link"
            name="href"
            required
            list={datalistId}
            placeholder="/about or https://…"
            defaultValue={item?.href}
            errors={fieldErrors?.href}
            hint="Pick a page or type any link — a WhatsApp link, another site, anything."
          />
          <datalist id={datalistId}>
            {hrefSuggestions.map((suggestion) => (
              <option key={suggestion.value} value={suggestion.value}>
                {suggestion.label}
              </option>
            ))}
          </datalist>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isVisible"
              defaultChecked={item?.isVisible ?? true}
              className="accent-primary size-4"
            />
            Visible in the menu
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="opensNewTab"
              defaultChecked={item?.opensNewTab ?? false}
              className="accent-primary size-4"
            />
            Open in a new tab
          </label>

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
