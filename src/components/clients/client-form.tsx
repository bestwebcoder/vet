"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClientDetail } from "@/features/clients/queries";
import { idleState, type FormState } from "@/lib/forms";

/**
 * One form for creating and editing a client, used by every clinic screen.
 */
export function ClientForm({
  action,
  branches,
  client,
  organizationId,
  submitLabel = "Save client",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  branches: { id: string; name: string }[];
  client?: ClientDetail;
  /** Required when creating: which practice the record belongs to. */
  organizationId?: string;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{client ? `Edit ${client.fullName}` : "Add a client"}</CardTitle>
        <CardDescription>
          A name and mobile number are enough. A client who has never registered online is a
          record like any other.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="grid gap-5" noValidate>
          <FormAlert state={state} />

          {client ? <input type="hidden" name="clientId" value={client.id} /> : null}
          {organizationId ? (
            <input type="hidden" name="organizationId" value={organizationId} />
          ) : null}

          <Field
            label="Full name"
            name="fullName"
            defaultValue={client?.fullName}
            required
            errors={fieldErrors?.fullName}
          />

          <Field
            label="Mobile number"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={client?.phone}
            required
            hint="For example 01712345678"
            errors={fieldErrors?.phone}
          />

          <Field
            label="Alternate number"
            name="alternatePhone"
            type="tel"
            inputMode="tel"
            defaultValue={client?.alternatePhone ?? ""}
            errors={fieldErrors?.alternatePhone}
          />

          <Field
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            defaultValue={client?.email ?? ""}
            errors={fieldErrors?.email}
          />

          <Field
            label="Address"
            name="address"
            defaultValue={client?.address ?? ""}
            errors={fieldErrors?.address}
          />

          <Field
            label="City"
            name="city"
            defaultValue={client?.city ?? ""}
            errors={fieldErrors?.city}
          />

          {branches.length > 1 ? (
            <SelectField
              label="Preferred branch"
              name="preferredBranchId"
              options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              defaultValue={client?.preferredBranchId ?? undefined}
              placeholder="No preference"
            />
          ) : null}

          <Field
            label="Notes"
            name="notes"
            defaultValue={client?.notes ?? ""}
            hint="Anything the practice should know when this client calls."
            errors={fieldErrors?.notes}
          />

          <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
