"use client";

import { useActionState } from "react";

import { DatePicker } from "@/components/form/date-picker";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { issueInvoiceAction } from "@/features/invoices/actions";
import { idleState } from "@/lib/forms";

export function IssueInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [state, formAction] = useActionState(issueInvoiceAction, idleState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Issue this invoice</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <FormAlert state={state} />
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <DatePicker label="Due date" name="dueDate" hint="Defaults to 14 days from today if left blank" fromDate={new Date()} />
          <TextAreaField label="Notes (optional)" name="notes" rows={2} />
          <div>
            <SubmitButton pendingLabel="Issuing…">Issue invoice</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
