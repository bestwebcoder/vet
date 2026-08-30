"use client";

import { createElement, useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Badge } from "@/components/ui/badge";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createCategoryAction,
  deleteCategoryAction,
  toggleCategoryActiveAction,
  updateCategoryAction,
} from "@/features/service-categories/actions";
import type { ServiceCategory } from "@/features/service-categories/queries";
import { idleState } from "@/lib/forms";
import { ICON_OPTIONS, iconByKey } from "@/lib/icons";

/**
 * A category is also a section heading on the public services page, so it
 * carries a blurb and an icon alongside its name — see
 * src/components/marketing/service-category-section.tsx, which renders them.
 */
const ICON_CHOICES = [
  { value: "", label: "No icon" },
  ...ICON_OPTIONS.map((option) => ({ value: option.key, label: option.label })),
];

/** Same reasoning as the public page's CategoryIcon — see that file. */
function CategoryIcon({ icon }: { icon: string | null }) {
  const found = iconByKey(icon);
  if (!found) return null;

  return createElement(found, { "aria-hidden": true, className: "text-muted-foreground mt-0.5 size-4 shrink-0" });
}

function CategoryFields({
  defaults,
  errors,
}: {
  defaults?: ServiceCategory;
  errors?: Record<string, string[] | undefined>;
}) {
  return (
    <div className="grid gap-3">
      <Field label="Category name" name="name" defaultValue={defaults?.name ?? ""} errors={errors?.name} />
      <TextAreaField
        label="Description"
        name="description"
        rows={2}
        defaultValue={defaults?.description ?? ""}
        hint="Shown under this heading on the public services page."
        errors={errors?.description}
      />
      <SelectField label="Icon" name="icon" options={ICON_CHOICES} defaultValue={defaults?.icon ?? ""} />
    </div>
  );
}

/**
 * Exported because the website editor edits the same three fields — a
 * category is a section heading on the public page, so its name, blurb and
 * icon are website copy as much as catalogue structure. One dialog, one
 * action, whichever screen it is opened from.
 */
export function EditCategoryDialog({
  category,
  triggerLabel = "Edit",
}: {
  category: ServiceCategory;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateCategoryAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>{triggerLabel}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {category.name}</DialogTitle>
          <DialogDescription>
            The name, blurb and icon for this section of the public services page.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="categoryId" value={category.id} />
          <CategoryFields defaults={category} errors={fieldErrors} />
          <DialogFooter>
            <Button type="button" variant="outline" size="touch" className="w-full sm:w-auto" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…" className="w-full sm:w-auto">
              Save category
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleCategoryActiveButton({ category }: { category: ServiceCategory }) {
  const [, formAction] = useActionState(toggleCategoryActiveAction, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="categoryId" value={category.id} />
      <input type="hidden" name="isActive" value={String(category.isActive)} />
      <Button type="submit" variant="ghost" size="sm">
        {category.isActive ? "Deactivate" : "Reactivate"}
      </Button>
    </form>
  );
}

function AddCategoryForm() {
  const [state, formAction] = useActionState(createCategoryAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="border-border/60 grid gap-3 border-t pt-4">
      <FormAlert state={state} />
      <CategoryFields errors={fieldErrors} />
      <SubmitButton pendingLabel="Adding…" className="sm:w-auto sm:justify-self-start">
        Add category
      </SubmitButton>
    </form>
  );
}

export function DeleteCategoryDialog({ category }: { category: ServiceCategory }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteCategoryAction, idleState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>Delete</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete {category.name}?</DialogTitle>
          <DialogDescription>
            Services in this category are not removed — they simply show as having no category, and you can
            reassign them afterwards.
          </DialogDescription>
        </DialogHeader>
        <FormAlert state={state} />
        <form action={formAction}>
          <input type="hidden" name="categoryId" value={category.id} />
          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Deleting…" className="sm:w-auto">
              Delete category
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ServiceCategoryManager({
  categories,
  pagination,
}: {
  categories: ServiceCategory[];
  /** Rendered under the list. Passed in because paging is decided by the page, which owns the URL. */
  pagination?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Service categories</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {categories.length === 0 ? (
          <p className="text-muted-foreground text-sm">No categories configured yet.</p>
        ) : (
          <ul className="grid gap-2">
            {categories.map((category) => (
              <li key={category.id} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                <span className="flex min-w-0 items-start gap-2">
                  <CategoryIcon icon={category.icon} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      {category.name}
                      {!category.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                    </span>
                    {category.description ? (
                      <span className="text-muted-foreground mt-0.5 block text-xs">{category.description}</span>
                    ) : null}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <EditCategoryDialog category={category} />
                  <ToggleCategoryActiveButton category={category} />
                  <DeleteCategoryDialog category={category} />
                </span>
              </li>
            ))}
          </ul>
        )}

        {pagination}

        <AddCategoryForm />
      </CardContent>
    </Card>
  );
}
