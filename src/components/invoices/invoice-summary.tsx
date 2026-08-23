"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateDiscountAction } from "@/features/invoices/actions";
import type { InvoiceDetail } from "@/features/invoices/queries";
import { paisaToTaaka } from "@/lib/currency";
import { idleState } from "@/lib/forms";

/** subtotal/tax/total/paid/balance are always the database trigger's numbers — nothing here recomputes them. */
export function InvoiceSummary({ invoice, canEdit }: { invoice: InvoiceDetail; canEdit: boolean }) {
  const [state, formAction] = useActionState(updateDiscountAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const canEditDiscount = canEdit && invoice.status === "draft";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Totals</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span data-numeric>{invoice.subtotal}</span>
        </div>

        {canEditDiscount ? (
          <form action={formAction} className="flex items-end gap-2">
            <FormAlert state={state} />
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <div className="flex-1">
              <Field
                label="Discount (৳)"
                name="discountPaisa"
                inputMode="decimal"
                defaultValue={paisaToTaaka(invoice.discountPaisa)}
                errors={fieldErrors?.discountPaisa}
              />
            </div>
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          </form>
        ) : (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span data-numeric>−{invoice.discount}</span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span data-numeric>{invoice.tax}</span>
        </div>
        <div className="flex justify-between border-t pt-2 font-medium">
          <span>Total</span>
          <span data-numeric>{invoice.total}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Amount paid</span>
          <span data-numeric>{invoice.amountPaid}</span>
        </div>
        <div className="text-destructive flex justify-between font-medium">
          <span>Balance due</span>
          <span data-numeric>{invoice.balance}</span>
        </div>
      </CardContent>
    </Card>
  );
}
