"use client";

import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PasswordFieldProps = Omit<ComponentProps<typeof Input>, "type"> & {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
};

/**
 * Field's password sibling, with a reveal toggle.
 *
 * A separate component rather than a flag on Field: the toggle needs client
 * state, and Field is a server component every form in the app renders. This
 * keeps the "use client" boundary around the one control that needs it.
 *
 * The toggle is a button, not a checkbox, and is deliberately outside the tab
 * order — someone typing a password should reach the next field, not a control
 * that puts their password on screen. It stays reachable by pointer, and by
 * keyboard once tabbed past. Revealed state is never the default and resets
 * with the component.
 */
export function PasswordField({ label, name, errors, hint, className, ...props }: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const reactId = useId();
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const statusId = `${reactId}-status`;
  const hasError = Boolean(errors?.length);

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>

      <div className="relative">
        <Input
          id={name}
          name={name}
          type={revealed ? "text" : "password"}
          aria-invalid={hasError || undefined}
          aria-describedby={cn(hasError && errorId, hint && hintId) || undefined}
          className={cn("pr-11", hasError && "border-destructive focus-visible:ring-destructive/40", className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setRevealed((current) => !current)}
          aria-pressed={revealed}
          aria-controls={name}
          aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md focus-visible:ring-2 focus-visible:outline-none"
        >
          {revealed ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>

      {/* Announced on toggle, so a screen reader user knows the password is now
          visible on screen rather than only hearing the button's new label. */}
      <span id={statusId} role="status" className="sr-only">
        {revealed ? `${label} is showing` : ""}
      </span>

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
