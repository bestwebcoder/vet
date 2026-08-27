"use client";

import { format } from "date-fns";
import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefundDialog } from "@/components/invoices/refund-dialog";
import { recordPaymentAction } from "@/features/payments/actions";
import type { Payment, Refund } from "@/features/payments/queries";
import { formatCurrency } from "@/lib/currency";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/validation/payment";
import { idleState } from "@/lib/forms";

export function RecordPaymentForm({
  invoiceId,
  payments,
  refunds,
  canRecordPayment,
  canRefund,
}: {
  invoiceId: string;
  payments: Payment[];
  refunds: Refund[];
  /** Only while the invoice still has a balance. */
  canRecordPayment: boolean;
  /** Any issued invoice with a payment on it, including one already paid in full. */
  canRefund: boolean;
}) {
  const [state, formAction] = useActionState(recordPaymentAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  // What has already gone back against each payment, so a row can show it and
  // the refund dialog can offer only what is left.
  const refundedByPayment = new Map<string, number>();
  for (const refund of refunds) {
    refundedByPayment.set(refund.paymentId, (refundedByPayment.get(refund.paymentId) ?? 0) + refund.amountPaisa);
  }

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
            {payments.map((payment) => {
              const refunded = refundedByPayment.get(payment.id) ?? 0;
              const fully = refunded >= payment.amountPaisa;

              return (
                <li key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div className="grid gap-0.5">
                    <span className="flex flex-wrap items-center gap-2 font-medium" data-numeric>
                      {payment.amount}
                      {refunded > 0 ? (
                        <Badge variant={fully ? "destructive" : "outline"}>
                          {fully ? "Refunded" : `${formatCurrency(refunded)} refunded`}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground text-xs" data-numeric>
                      {PAYMENT_METHOD_LABELS[payment.method]} · {format(new Date(payment.paidAt), "d MMM yyyy")}
                      {payment.referenceNumber ? ` · Ref ${payment.referenceNumber}` : ""}
                    </span>
                  </div>
                  {canRefund ? <RefundDialog payment={payment} refundedPaisa={refunded} /> : null}
                </li>
              );
            })}
          </ul>
        )}

        {refunds.length > 0 ? (
          <div className="grid gap-2 border-t pt-4">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Refunds</p>
            <ul className="grid gap-2">
              {refunds.map((refund) => (
                <li key={refund.id} className="grid gap-0.5 rounded-lg border p-3 text-sm">
                  <span className="font-medium" data-numeric>
                    −{refund.amount}
                  </span>
                  <span className="text-muted-foreground text-xs" data-numeric>
                    {PAYMENT_METHOD_LABELS[refund.method]} · {format(new Date(refund.refundedAt), "d MMM yyyy")}
                    {refund.referenceNumber ? ` · Ref ${refund.referenceNumber}` : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">{refund.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {canRecordPayment ? (
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
