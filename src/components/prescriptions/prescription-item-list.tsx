"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addPrescriptionItemAction,
  removePrescriptionItemAction,
  updatePrescriptionItemAction,
} from "@/features/prescriptions/actions";
import type { MedicationOption, PrescriptionItem } from "@/features/prescriptions/queries";
import { computeDose, InvalidDoseError, MissingWeightError } from "@/lib/dose";
import { idleState } from "@/lib/forms";

type Props = {
  prescriptionId: string;
  appointmentId: string;
  petId: string;
  items: PrescriptionItem[];
  medications: MedicationOption[];
  visitWeightGrams: number | null;
  visitWeightDisplay: string | null;
  canEdit: boolean;
};

/**
 * Every field the calculator preview needs, kept in one small block so both
 * the add form and each item's edit form can share it.
 */
function DoseFields({
  namePrefix = "",
  defaults,
  visitWeightGrams,
  errors,
}: {
  namePrefix?: string;
  defaults?: Partial<PrescriptionItem>;
  visitWeightGrams: number | null;
  errors?: Record<string, string[] | undefined>;
}) {
  const [dosePerKg, setDosePerKg] = useState(defaults?.dosePerKg?.toString() ?? "");
  const [doseUnit, setDoseUnit] = useState(defaults?.doseUnit ?? "mg");
  const [computedDose, setComputedDose] = useState(defaults?.computedDose?.toString() ?? "");
  const [calcMessage, setCalcMessage] = useState<string | null>(null);

  function calculate() {
    const rate = Number(dosePerKg);
    try {
      const dose = computeDose(visitWeightGrams, rate);
      setComputedDose(String(dose));
      setCalcMessage(
        visitWeightGrams
          ? `${(visitWeightGrams / 1000).toFixed(2)} kg × ${rate}${doseUnit}/kg = ${dose}${doseUnit}`
          : null,
      );
    } catch (error) {
      if (error instanceof MissingWeightError || error instanceof InvalidDoseError) {
        setCalcMessage(error.message);
      } else {
        setCalcMessage("Could not calculate a dose.");
      }
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Field
        label="Dose per kg"
        name={`${namePrefix}dosePerKg`}
        inputMode="decimal"
        value={dosePerKg}
        onChange={(event) => setDosePerKg(event.target.value)}
        hint="Optional — leave blank for a flat dose"
        errors={errors?.dosePerKg}
      />
      <Field
        label="Unit"
        name={`${namePrefix}doseUnit`}
        value={doseUnit}
        onChange={(event) => setDoseUnit(event.target.value)}
        placeholder="mg"
        errors={errors?.doseUnit}
      />
      <div className="grid gap-2 sm:col-span-2">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field
              label="Dose"
              name={`${namePrefix}computedDose`}
              value={computedDose}
              onChange={(event) => setComputedDose(event.target.value)}
              errors={errors?.computedDose}
            />
          </div>
          <Button type="button" variant="outline" onClick={calculate}>
            Calculate
          </Button>
        </div>
        {calcMessage ? <p className="text-muted-foreground text-xs">{calcMessage}</p> : null}
      </div>
    </div>
  );
}

function ItemFields({
  medications,
  defaults,
  visitWeightGrams,
  errors,
}: {
  medications: MedicationOption[];
  defaults?: Partial<PrescriptionItem>;
  visitWeightGrams: number | null;
  errors?: Record<string, string[] | undefined>;
}) {
  const [medicationId, setMedicationId] = useState(defaults?.medicationId ?? "");
  const [drugName, setDrugName] = useState(defaults?.drugName ?? "");
  const [strength, setStrength] = useState(defaults?.strength ?? "");
  const [formulation, setFormulation] = useState(defaults?.formulation ?? "");

  function pickMedication(id: string) {
    setMedicationId(id);
    const medication = medications.find((candidate) => candidate.id === id);
    if (medication) {
      setDrugName(medication.name);
      setStrength(medication.commonStrength ?? "");
      setFormulation(medication.formulation ?? "");
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label="From catalog (optional)"
          name="medicationId"
          options={[{ value: "", label: "Type a drug name instead" }, ...medications.map((m) => ({ value: m.id, label: m.name }))]}
          value={medicationId}
          onValueChange={pickMedication}
        />
        <Field
          label="Drug name"
          name="drugName"
          value={drugName}
          onChange={(event) => setDrugName(event.target.value)}
          errors={errors?.drugName}
        />
        <Field
          label="Strength"
          name="strength"
          value={strength}
          onChange={(event) => setStrength(event.target.value)}
          errors={errors?.strength}
        />
      </div>

      <Field
        label="Formulation"
        name="formulation"
        value={formulation}
        onChange={(event) => setFormulation(event.target.value)}
        placeholder="Tablet, oral suspension, injectable…"
        errors={errors?.formulation}
      />

      <DoseFields defaults={defaults} visitWeightGrams={visitWeightGrams} errors={errors} />

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Route" name="route" defaultValue={defaults?.route ?? ""} placeholder="PO" errors={errors?.route} />
        <Field label="Frequency" name="frequency" defaultValue={defaults?.frequency ?? ""} placeholder="SID" errors={errors?.frequency} />
        <Field label="Duration" name="duration" defaultValue={defaults?.duration ?? ""} placeholder="5 days" errors={errors?.duration} />
        <Field label="Quantity" name="quantity" defaultValue={defaults?.quantity ?? ""} errors={errors?.quantity} />
      </div>

      <TextAreaField
        label="Instructions"
        name="instructions"
        rows={2}
        defaultValue={defaults?.instructions ?? ""}
        errors={errors?.instructions}
      />
    </div>
  );
}

function AddItemForm({ prescriptionId, appointmentId, petId, medications, visitWeightGrams }: Omit<Props, "items" | "canEdit" | "visitWeightDisplay">) {
  const [state, formAction] = useActionState(addPrescriptionItemAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-4 border-t pt-4">
      <FormAlert state={state} />
      <input type="hidden" name="prescriptionId" value={prescriptionId} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="petId" value={petId} />
      <ItemFields medications={medications} visitWeightGrams={visitWeightGrams} errors={fieldErrors} />
      <div>
        <SubmitButton pendingLabel="Adding…">Add medication</SubmitButton>
      </div>
    </form>
  );
}

function ItemRow({
  item,
  appointmentId,
  petId,
  medications,
  visitWeightGrams,
  canEdit,
}: {
  item: PrescriptionItem;
  appointmentId: string;
  petId: string;
  medications: MedicationOption[];
  visitWeightGrams: number | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updatePrescriptionItemAction, idleState);
  const [, removeAction] = useActionState(removePrescriptionItemAction, idleState);
  const fieldErrors = updateState.status === "error" ? updateState.fieldErrors : undefined;

  const doseLabel =
    item.computedDose != null
      ? `${item.computedDose}${item.doseUnit ?? ""}`
      : item.dosePerKg != null
        ? `${item.dosePerKg}${item.doseUnit ?? ""}/kg`
        : "No dose recorded";

  if (!editing) {
    return (
      <li className="grid gap-1 rounded-lg border p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <span className="font-medium">{item.drugName}</span>
            <span className="text-muted-foreground text-xs">
              {[item.strength, item.formulation].filter(Boolean).join(" · ")}
            </span>
            <span className="text-muted-foreground text-xs" data-numeric>
              {doseLabel}
              {item.route ? ` · ${item.route}` : ""}
              {item.frequency ? ` · ${item.frequency}` : ""}
              {item.duration ? ` · ${item.duration}` : ""}
            </span>
            {item.instructions ? <span className="text-muted-foreground text-xs">{item.instructions}</span> : null}
          </div>
          {canEdit ? (
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <form action={removeAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="appointmentId" value={appointmentId} />
                <input type="hidden" name="petId" value={petId} />
                <Button type="submit" variant="ghost" size="sm">
                  Remove
                </Button>
              </form>
            </div>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-lg border p-3">
      <form action={updateAction} className="grid gap-4">
        <FormAlert state={updateState} />
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <input type="hidden" name="petId" value={petId} />
        <ItemFields medications={medications} defaults={item} visitWeightGrams={visitWeightGrams} errors={fieldErrors} />
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Saving…">Save item</SubmitButton>
          <Button type="button" variant="outline" onClick={() => setEditing(false)}>
            Done
          </Button>
        </div>
      </form>
    </li>
  );
}

export function PrescriptionItemList({
  prescriptionId,
  appointmentId,
  petId,
  items,
  medications,
  visitWeightGrams,
  visitWeightDisplay,
  canEdit,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Medications</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-muted-foreground text-sm">
          Weight used for dose calculation: {visitWeightDisplay ?? "not recorded for this visit"}
        </p>

        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No medications added yet.</p>
        ) : (
          <ul className="grid gap-2">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                appointmentId={appointmentId}
                petId={petId}
                medications={medications}
                visitWeightGrams={visitWeightGrams}
                canEdit={canEdit}
              />
            ))}
          </ul>
        )}

        {canEdit ? (
          <AddItemForm
            prescriptionId={prescriptionId}
            appointmentId={appointmentId}
            petId={petId}
            medications={medications}
            visitWeightGrams={visitWeightGrams}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
