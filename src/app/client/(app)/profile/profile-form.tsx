"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { PasswordField } from "@/components/form/password-field";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { ImageCropField } from "@/components/media/image-crop-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateOwnClientProfileAction } from "@/features/profile/actions";
import type { ClientDetail } from "@/features/clients/queries";
import { idleState } from "@/lib/forms";

/**
 * The whole client profile — photo, contact details and password — as one
 * form behind one Save button, rather than three cards each with their own.
 * Someone correcting their phone number and their address should not have to
 * think about which section they are in.
 *
 * The password section is optional and left blank means "leave it alone";
 * everything is validated server-side before any of it is written.
 */
export function ProfileForm({
  client,
  avatarUrl,
  branches,
}: {
  client: ClientDetail;
  avatarUrl: string | null;
  branches: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(updateOwnClientProfileAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photo</CardTitle>
          <CardDescription>Shown next to your name throughout TV Care.</CardDescription>
        </CardHeader>
        <CardContent>
          <ImageCropField
            id="avatar"
            name="avatar"
            label="Photo"
            errors={fieldErrors?.avatar}
            aspect={1}
            outputWidth={400}
            outputHeight={400}
            shape="round"
            previewUrl={avatarUrl}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact details</CardTitle>
          <CardDescription>
            Keeping these current means your clinic can reach you about your pets.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password</CardTitle>
          <CardDescription>
            Leave these blank unless you want to change the password you sign in with.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <PasswordField
            label="Current password"
            name="currentPassword"
            autoComplete="current-password"
            errors={fieldErrors?.currentPassword}
          />

          <PasswordField
            label="New password"
            name="newPassword"
            autoComplete="new-password"
            hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number."
            errors={fieldErrors?.newPassword}
          />

          <PasswordField
            label="Confirm new password"
            name="confirmPassword"
            autoComplete="new-password"
            errors={fieldErrors?.confirmPassword}
          />
        </CardContent>
      </Card>

      {/* Beside the button that produced it, not at the top of a page the
          reader has already scrolled past. */}
      <div className="grid gap-4">
        <FormAlert state={state} />
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
