"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addInvoiceItemAction, removeInvoiceItemAction, updateInvoiceItemAction } from "@/features/invoices/actions";
import type { InvoiceItem } from "@/features/invoices/queries";
import type { ServiceSummary } from "@/features/services/queries";
import { paisaToTaaka } from "@/lib/currency";
import { idleState } from "@/lib/forms";

function ItemFields({
  services,
  defaults,
  errors,
}: {
  services: ServiceSummary[];
  defaults?: Partial<InvoiceItem>;
  errors?: Record<string, string[] | undefined>;
}) {
  const [serviceId, setServiceId] = useState(defaults?.serviceId ?? "");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [unitPrice, setUnitPrice] = useState(defaults?.unitPricePaisa != null ? paisaToTaaka(defaults.unitPricePaisa) : "");
  const [taxRate, setTaxRate] = useState(defaults?.taxRatePercent?.toString() ?? "0");

  function pickService(id: string) {
    setServiceId(id);
    const service = services.find((candidate) => candidate.id === id);
    if (service) {
      setDescription(service.name);
      setUnitPrice(paisaToTaaka(service.pricePaisa));
      setTaxRate(service.taxRatePercent.toString());
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-5">
      <div className="sm:col-span-2">
        <SelectField
          label="From catalog (optional)"
          name="serviceId"
          options={[{ value: "", label: "Type a description instead" }, ...services.map((s) => ({ value: s.id, label: s.name }))]}
          value={serviceId}
          onValueChange={pickService}
        />
      </div>
      <div className="sm:col-span-3">
        <Field
          label="Description"
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          errors={errors?.description}
        />
      </div>
      <Field label="Quantity" name="quantity" inputMode="numeric" defaultValue={defaults?.quantity?.toString() ?? "1"} errors={errors?.quantity} />
      <Field
        label="Unit price (৳)"
        name="unitPricePaisa"
        inputMode="decimal"
        value={unitPrice}
        onChange={(event) => setUnitPrice(event.target.value)}
        errors={errors?.unitPricePaisa}
      />
      <Field
        label="Tax / VAT (%)"
        name="taxRatePercent"
        inputMode="decimal"
        value={taxRate}
        onChange={(event) => setTaxRate(event.target.value)}
        errors={errors?.taxRatePercent}
      />
    </div>
  );
}

function AddItemForm({ invoiceId, services }: { invoiceId: string; services: ServiceSummary[] }) {
  const [state, formAction] = useActionState(addInvoiceItemAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-4 border-t pt-4">
      <FormAlert state={state} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <ItemFields services={services} errors={fieldErrors} />
      <div>
        <SubmitButton pendingLabel="Adding…">Add item</SubmitButton>
      </div>
    </form>
  );
}

function ItemRow({ item, invoiceId, services, canEdit }: { item: InvoiceItem; invoiceId: string; services: ServiceSummary[]; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateInvoiceItemAction, idleState);
  const [, removeAction] = useActionState(removeInvoiceItemAction, idleState);
  const fieldErrors = updateState.status === "error" ? updateState.fieldErrors : undefined;

  if (!editing) {
    return (
      <li className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
        <div className="grid gap-0.5">
          <span className="font-medium">{item.description}</span>
          <span className="text-muted-foreground text-xs" data-numeric>
            {item.quantity} × {item.unitPrice}
            {item.taxRatePercent ? ` + ${item.taxRatePercent}% tax` : ""} = {item.lineTotal}
          </span>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <form action={removeAction}>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <Button type="submit" variant="ghost" size="sm">
                Remove
              </Button>
            </form>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <li className="rounded-lg border p-3">
      <form action={updateAction} className="grid gap-4">
        <FormAlert state={updateState} />
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <ItemFields services={services} defaults={item} errors={fieldErrors} />
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

export function InvoiceItemList({
  invoiceId,
  items,
  services,
  canEdit,
}: {
  invoiceId: string;
  items: InvoiceItem[];
  services: ServiceSummary[];
  canEdit: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Items</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No items added yet.</p>
        ) : (
          <ul className="grid gap-2">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} invoiceId={invoiceId} services={services} canEdit={canEdit} />
            ))}
          </ul>
        )}

        {canEdit ? <AddItemForm invoiceId={invoiceId} services={services} /> : null}
      </CardContent>
    </Card>
  );
}
