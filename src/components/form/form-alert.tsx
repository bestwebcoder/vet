import { Alert, AlertDescription } from "@/components/ui/alert";

import type { FormState } from "@/lib/forms";

/**
 * Renders the form-level outcome. Server actions never return technical
 * detail, so whatever reaches here is safe to show a user.
 */
export function FormAlert({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  if (state.status === "success" && !state.message && !state.warning) return null;

  const isError = state.status === "error";
  const warning = state.status === "success" ? state.warning : undefined;

  return (
    <Alert
      variant={isError ? "destructive" : "default"}
      role={isError ? "alert" : "status"}
      className={isError ? undefined : "border-primary/30 bg-primary/5"}
    >
      <AlertDescription>
        {state.message}
        {warning ? <span className="block text-muted-foreground">{warning}</span> : null}
      </AlertDescription>
    </Alert>
  );
}
