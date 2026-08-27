"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
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
import { recordRefundAction } from "@/features/payments/actions";
import type { Payment } from "@/features/payments/queries";
import { formatCurrency } from "@/lib/currency";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/validation/payment";
import { idleState } from "@/lib/forms";

/**
 * Refunds one payment, in part or in full.
 *
 * Defaults the amount to whatever is left rather than to the whole payment:
 * refunding twice by accident is the mistake worth designing against, and the
 * remaining figure is the one an admin actually means most of the time.
 *
 * The method defaults to how the money came in, but stays editable — a bKash
 * payment refunded in cash across the counter should say so.
 */
export function RefundDialog({ payment, refundedPaisa }: { payment: Payment; refundedPaisa: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(recordRefundAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  const remaining = payment.amountPaisa - refundedPaisa;
  if (remaining <= 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>Refund</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund {formatCurrency(remaining)}?</DialogTitle>
          <DialogDescription>
            {refundedPaisa > 0
              ? `${formatCurrency(refundedPaisa)} of this ${payment.amount} payment has already been refunded. ${formatCurrency(remaining)} is left.`
              : `This payment was ${payment.amount}. Refund all of it, or part.`}{" "}
            The payment itself is kept — the refund is recorded alongside it.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="paymentId" value={payment.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Amount (৳)"
              name="amountPaisa"
              inputMode="decimal"
              defaultValue={(remaining / 100).toFixed(2)}
              errors={fieldErrors?.amountPaisa}
            />
            <SelectField
              label="Refunded by"
              name="method"
              options={PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }))}
              defaultValue={payment.method}
            />
          </div>

          <TextAreaField label="Reason" name="reason" rows={2} required errors={fieldErrors?.reason} />
          <Field label="Reference number (optional)" name="referenceNumber" errors={fieldErrors?.referenceNumber} />

          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Refunding…" className="sm:w-auto">
              Record refund
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
