"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createCategoryAction, toggleCategoryActiveAction } from "@/features/service-categories/actions";
import type { ServiceCategory } from "@/features/service-categories/queries";
import { idleState } from "@/lib/forms";

function ToggleActiveButton({ category }: { category: ServiceCategory }) {
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
    <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <FormAlert state={state} />
      <Field label="Category name" name="name" errors={fieldErrors?.name} />
      <SubmitButton pendingLabel="Adding…">Add category</SubmitButton>
    </form>
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
              <li key={category.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <span className="flex items-center gap-2">
                  {category.name}
                  {!category.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                </span>
                <ToggleActiveButton category={category} />
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
