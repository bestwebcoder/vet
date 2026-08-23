"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateOrganizationSettingsAction } from "@/features/organizations/actions";
import type { Organization } from "@/features/organizations/queries";
import { idleState } from "@/lib/forms";
import { TIMEZONE_OPTIONS } from "@/lib/validation/organization";

export function SettingsForm({ organization }: { organization: Organization }) {
  const [state, formAction] = useActionState(updateOrganizationSettingsAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Practice details</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />

          <Field label="Practice name" name="name" defaultValue={organization.name} required errors={fieldErrors?.name} />
          <Field
            label="Legal name"
            name="legalName"
            defaultValue={organization.legalName ?? ""}
            hint="Shown on formal documents, if different from the practice name."
            errors={fieldErrors?.legalName}
          />

          <SelectField
            label="Timezone"
            name="timezone"
            options={[...TIMEZONE_OPTIONS]}
            defaultValue={organization.timezone}
          />

          <Field label="Email" name="email" type="email" inputMode="email" defaultValue={organization.email ?? ""} errors={fieldErrors?.email} />
          <Field label="Phone" name="phone" type="tel" inputMode="tel" defaultValue={organization.phone ?? ""} errors={fieldErrors?.phone} />
          <Field label="Address" name="address" defaultValue={organization.address ?? ""} errors={fieldErrors?.address} />
          <Field label="City" name="city" defaultValue={organization.city ?? ""} errors={fieldErrors?.city} />
          <Field label="Country" name="country" defaultValue={organization.country} required errors={fieldErrors?.country} />

          <div>
            <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
