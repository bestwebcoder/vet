import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type TextAreaFieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  hint?: string;
  errors?: string[];
  required?: boolean;
  /** For a step of a larger flow that needs the value outside this component. */
  onChange?: (value: string) => void;
};

/** The Field counterpart for a longer, free-text answer. */
export function TextAreaField({
  label,
  name,
  defaultValue,
  rows = 3,
  hint,
  errors,
  required,
  onChange,
}: TextAreaFieldProps) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const hasError = Boolean(errors?.length);

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        required={required}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        aria-invalid={hasError || undefined}
        aria-describedby={cn(hasError && errorId, hint && hintId) || undefined}
        className={cn(
          "border-input bg-background placeholder:text-muted-foreground rounded-lg border px-3 py-2 text-base",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
          "md:text-sm",
          hasError && "border-destructive",
        )}
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
