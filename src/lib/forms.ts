import type { ZodError } from "zod";

/**
 * The shape every server action returns.
 *
 * Technical detail is logged, never returned: the user gets a sentence, the
 * server keeps the cause.
 */
export type FormState =
  | { status: "idle" }
  // `warning` is for a save that landed but lost something along the way —
  // a photo that would not upload. The record exists; the sentence still
  // has to be read, so callers must not treat it as a plain success.
  | { status: "success"; message?: string; id?: string; warning?: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

export const idleState: FormState = { status: "idle" };

export function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fieldErrors;
}

export function invalid(error: ZodError, message = "Please correct the highlighted fields."): FormState {
  return { status: "error", message, fieldErrors: fieldErrorsFrom(error) };
}

/** Logs the cause and returns a sentence safe to show anyone. */
export function failure(context: string, cause: unknown, message: string): FormState {
  console.error(`[${context}]`, cause);
  return { status: "error", message };
}

/** Reads a form value as trimmed text, or undefined when absent or blank. */
export function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Reads a tri-state checkbox/select: "yes", "no", or unrecorded. */
export function triState(formData: FormData, key: string): boolean | null {
  const value = text(formData, key);
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}
