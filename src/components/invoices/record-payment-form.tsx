"use client";

import { format } from "date-fns";
import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { recordPaymentAction } from "@/features/payments/actions";
import type { Payment } from "@/features/payments/queries";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/validation/payment";
import { idleState } from "@/lib/forms";

export function RecordPaymentForm({ invoiceId, payments, canEdit }: { invoiceId: string; payments: Payment[]; canEdit: boolean }) {
  const [state, formAction] = useActionState(recordPaymentAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payments</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No payments recorded yet.</p>
        ) : (
          <ul className="grid gap-2">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <div className="grid gap-0.5">
                  <span className="font-medium" data-numeric>
                    {payment.amount}
                  </span>
                  <span className="text-muted-foreground text-xs" data-numeric>
                    {PAYMENT_METHOD_LABELS[payment.method]} · {format(new Date(payment.paidAt), "d MMM yyyy")}
                    {payment.referenceNumber ? ` · Ref ${payment.referenceNumber}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <form action={formAction} className="grid gap-4 border-t pt-4">
            <FormAlert state={state} />
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Amount (৳)" name="amountPaisa" inputMode="decimal" errors={fieldErrors?.amountPaisa} />
              <SelectField
                label="Method"
                name="method"
                options={PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }))}
                defaultValue="cash"
              />
              <Field label="Reference number (optional)" name="referenceNumber" errors={fieldErrors?.referenceNumber} />
            </div>
            <TextAreaField label="Notes (optional)" name="notes" rows={2} />
            <div>
              <SubmitButton pendingLabel="Recording…">Record payment</SubmitButton>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
