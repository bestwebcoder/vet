"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * Consistent pending state for every form in the app: the control disables
 * itself and says what is happening, so nobody double-submits a record.
 */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="h-11 w-full" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
