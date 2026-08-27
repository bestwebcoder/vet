"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Consistent pending state for every form in the app: the control disables
 * itself and says what is happening, so nobody double-submits a record.
 *
 * Takes a variant so a confirmation that deletes something can look like it —
 * the alternative was hand-rolling a submit button beside every destructive
 * dialog, which is how they drift apart.
 */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="touch"
      variant={variant}
      className={cn("w-full", className)}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
