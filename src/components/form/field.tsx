import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = ComponentProps<typeof Input> & {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
};

/**
 * Label, control, hint and error in one place, so every form in the app
 * reports problems the same way and stays accessible without each screen
 * remembering to wire aria attributes.
 */
export function Field({ label, name, errors, hint, className, ...props }: FieldProps) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const hasError = Boolean(errors?.length);

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={hasError || undefined}
        aria-describedby={cn(hasError && errorId, hint && hintId) || undefined}
        className={cn(hasError && "border-destructive focus-visible:ring-destructive/40", className)}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} className="text-destructive text-sm" role="alert">
          {errors!.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
