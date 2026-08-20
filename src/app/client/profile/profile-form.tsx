"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/form/select-field";
import { updateClientAction } from "@/features/clients/actions";
import type { ClientDetail } from "@/features/clients/queries";
import { idleState } from "@/lib/forms";

export function ProfileForm({
  client,
  branches,
}: {
  client: ClientDetail;
  branches: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(updateClientAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact details</CardTitle>
        <CardDescription>
          Keeping these current means your clinic can reach you about your pets.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5" noValidate>
          <FormAlert state={state} />

          <input type="hidden" name="clientId" value={client.id} />

          <Field
            label="Full name"
            name="fullName"
            defaultValue={client.fullName}
            required
            errors={fieldErrors?.fullName}
          />

          <Field
            label="Mobile number"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={client.phone}
            required
            hint="For example 01712345678"
            errors={fieldErrors?.phone}
          />

          <Field
            label="Alternate number"
            name="alternatePhone"
            type="tel"
            inputMode="tel"
            defaultValue={client.alternatePhone ?? ""}
            errors={fieldErrors?.alternatePhone}
          />

          <Field
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            defaultValue={client.email ?? ""}
            errors={fieldErrors?.email}
          />

          <Field
            label="Address"
            name="address"
            defaultValue={client.address ?? ""}
            errors={fieldErrors?.address}
          />

          <Field
            label="City"
            name="city"
            defaultValue={client.city ?? ""}
            errors={fieldErrors?.city}
          />

          {branches.length > 1 ? (
            <SelectField
              label="Preferred branch"
              name="preferredBranchId"
              options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              defaultValue={client.preferredBranchId ?? undefined}
              placeholder="No preference"
            />
          ) : null}

          <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
