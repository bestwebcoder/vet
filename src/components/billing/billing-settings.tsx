"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toggleBillingPermissionAction } from "@/features/doctors/billing-actions";
import type { DoctorSummary } from "@/features/doctors/queries";
import { updatePaymentInstructionsAction } from "@/features/organizations/actions";
import { idleState } from "@/lib/forms";

function ToggleBillingPermissionButton({ doctor }: { doctor: DoctorSummary }) {
  const [, formAction] = useActionState(toggleBillingPermissionAction, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="doctorId" value={doctor.id} />
      <input type="hidden" name="canManageBilling" value={String(doctor.canManageBilling)} />
      <Button type="submit" variant="outline" size="sm">
        {doctor.canManageBilling ? "Remove billing access" : "Grant billing access"}
      </Button>
    </form>
  );
}

export function BillingSettings({
  organizationId,
  paymentInstructions,
  doctors,
}: {
  organizationId: string;
  paymentInstructions: string | null;
  doctors: DoctorSummary[];
}) {
  const [state, formAction] = useActionState(updatePaymentInstructionsAction, idleState);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment information</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-4">
            <FormAlert state={state} />
            <input type="hidden" name="organizationId" value={organizationId} />
            <TextAreaField
              label="Shown on every issued invoice"
              name="paymentInstructions"
              rows={4}
              defaultValue={paymentInstructions ?? ""}
              hint="Bank account, bKash/Nagad number, or however clients should pay."
            />
            <div>
              <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Doctor billing access</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-muted-foreground text-sm">
            A doctor without this cannot create invoices or record payments, even for their own appointments.
          </p>
          {doctors.length === 0 ? (
            <p className="text-muted-foreground text-sm">No doctors yet.</p>
          ) : (
            <ul className="grid gap-2">
              {doctors.map((doctor) => (
                <li key={doctor.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <span className="flex items-center gap-2">
                    {doctor.fullName}
                    {doctor.canManageBilling ? <Badge variant="secondary">Can manage billing</Badge> : null}
                  </span>
                  <ToggleBillingPermissionButton doctor={doctor} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
