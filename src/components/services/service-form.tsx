"use client";

import { useActionState, useState } from "react";

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
import { createServiceAction, deleteServiceAction, toggleServiceActiveAction, updateServiceAction } from "@/features/services/actions";
import type { ServiceSummary } from "@/features/services/queries";
import type { ServiceCategory } from "@/features/service-categories/queries";
import { paisaToTaaka } from "@/lib/currency";
import { idleState } from "@/lib/forms";

function ServiceFields({
  categories,
  defaults,
  errors,
}: {
  categories: ServiceCategory[];
  defaults?: Partial<ServiceSummary>;
  errors?: Record<string, string[] | undefined>;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service name" name="name" defaultValue={defaults?.name ?? ""} errors={errors?.name} />
        <SelectField
          label="Category"
          name="categoryId"
          options={[{ value: "", label: "No category" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          defaultValue={defaults?.categoryId ?? ""}
        />
      </div>

      <TextAreaField label="Description" name="description" rows={2} defaultValue={defaults?.description ?? ""} errors={errors?.description} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Duration (minutes)"
          name="durationMinutes"
          inputMode="numeric"
          defaultValue={defaults?.durationMinutes?.toString() ?? "30"}
          errors={errors?.durationMinutes}
        />
        <Field
          label="Price (৳)"
          name="pricePaisa"
          inputMode="decimal"
          defaultValue={defaults?.pricePaisa != null ? paisaToTaaka(defaults.pricePaisa) : ""}
          errors={errors?.pricePaisa}
        />
        <Field
          label="Tax / VAT (%)"
          name="taxRatePercent"
          inputMode="decimal"
          defaultValue={defaults?.taxRatePercent?.toString() ?? "0"}
          errors={errors?.taxRatePercent}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isHomeVisitAvailable"
            defaultChecked={defaults?.isHomeVisitAvailable ?? false}
            className="accent-primary size-4"
          />
          Available for home visit
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isHomeVisitFee"
            defaultChecked={defaults?.isHomeVisitFee ?? false}
            className="accent-primary size-4"
          />
          This is the home-visit fee
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="requiresDoctor"
            defaultChecked={defaults?.requiresDoctor ?? true}
            className="accent-primary size-4"
          />
          Requires a doctor
        </label>
      </div>
    </div>
  );
}

function AddServiceForm({ categories }: { categories: ServiceCategory[] }) {
  const [state, formAction] = useActionState(createServiceAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-4 border-t pt-4">
      <FormAlert state={state} />
      <ServiceFields categories={categories} errors={fieldErrors} />
      <div>
        <SubmitButton pendingLabel="Adding…">Add service</SubmitButton>
      </div>
    </form>
  );
}

function ToggleActiveButton({ service }: { service: ServiceSummary }) {
  const [, formAction] = useActionState(toggleServiceActiveAction, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="serviceId" value={service.id} />
      <input type="hidden" name="isActive" value={String(service.isActive)} />
      <Button type="submit" variant="ghost" size="sm">
        {service.isActive ? "Deactivate" : "Reactivate"}
      </Button>
    </form>
  );
}

function DeleteServiceDialog({ service }: { service: ServiceSummary }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteServiceAction, idleState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>Delete</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete {service.name}?</DialogTitle>
          <DialogDescription>
            This removes it from the catalog for good. A service that has ever been booked cannot be deleted —
            deactivate it instead, and it stays on past records while disappearing from booking.
          </DialogDescription>
        </DialogHeader>
        <FormAlert state={state} />
        <form action={formAction}>
          <input type="hidden" name="serviceId" value={service.id} />
          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Deleting…" className="sm:w-auto">
              Delete service
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ServiceRow({ service, categories }: { service: ServiceSummary; categories: ServiceCategory[] }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateServiceAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  if (!editing) {
    return (
      <li className="grid gap-1 rounded-lg border p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {service.name}
              {!service.isActive ? <Badge variant="outline">Inactive</Badge> : null}
              {service.isHomeVisitFee ? <Badge variant="secondary">Home-visit fee</Badge> : null}
            </span>
            <span className="text-muted-foreground text-xs" data-numeric>
              {service.categoryName ?? "No category"} · {service.price}
              {service.taxRatePercent ? ` + ${service.taxRatePercent}% tax` : ""} · {service.durationMinutes} min
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <ToggleActiveButton service={service} />
            <DeleteServiceDialog service={service} />
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-lg border p-3">
      <form action={formAction} className="grid gap-4">
        <FormAlert state={state} />
        <input type="hidden" name="serviceId" value={service.id} />
        <ServiceFields categories={categories} defaults={service} errors={fieldErrors} />
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          <Button type="button" variant="outline" onClick={() => setEditing(false)}>
            Done
          </Button>
        </div>
      </form>
    </li>
  );
}

export function ServiceManager({ services, categories }: { services: ServiceSummary[]; categories: ServiceCategory[] }) {
  return (
    <div className="grid gap-4">
      {services.length === 0 ? (
        <p className="text-muted-foreground text-sm">No services configured yet.</p>
      ) : (
        <ul className="grid gap-2">
          {services.map((service) => (
            <ServiceRow key={service.id} service={service} categories={categories} />
          ))}
        </ul>
      )}

      <AddServiceForm categories={categories} />
    </div>
  );
}
