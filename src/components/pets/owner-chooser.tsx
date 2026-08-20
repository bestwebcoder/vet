"use client";

import { useState } from "react";

import { Field } from "@/components/form/field";
import { SelectField } from "@/components/form/select-field";

const NEW_OWNER = "__new__";

/**
 * Picks the owner when clinic staff record a patient.
 *
 * Either an existing client, or a new one entered here — a vet meeting an
 * animal and its owner on the same visit should not have to leave the form to
 * create the person first.
 */
export function OwnerChooser({
  clients,
  organizationId,
}: {
  clients: { id: string; name: string; phone: string }[];
  organizationId?: string;
}) {
  const [selected, setSelected] = useState("");
  const isNew = selected === NEW_OWNER;

  return (
    <div className="grid gap-5">
      {organizationId ? (
        <input type="hidden" name="organizationId" value={organizationId} />
      ) : null}

      <SelectField
        label="Owner"
        name={isNew ? "ownerChoice" : "clientId"}
        options={[
          ...clients.map((client) => ({
            value: client.id,
            label: `${client.name} · ${client.phone}`,
          })),
          { value: NEW_OWNER, label: "Add a new client" },
        ]}
        value={selected}
        onValueChange={setSelected}
        placeholder="Search is on the patients page — choose an owner"
      />

      {isNew ? (
        <div className="border-border grid gap-5 rounded-lg border border-dashed p-4">
          <p className="text-muted-foreground text-sm">
            The new client is created with these details. Anything else can be added afterwards.
          </p>
          <Field label="Client's full name" name="newClientFullName" required />
          <Field
            label="Client's mobile number"
            name="newClientPhone"
            type="tel"
            inputMode="tel"
            required
            hint="For example 01712345678"
          />
        </div>
      ) : null}
    </div>
  );
}
