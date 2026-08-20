import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ErrorStateProps = {
  /** Plain language. Never a stack trace, error code, or database message. */
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Shown when something failed. The cause belongs in the server log; the person
 * reading this needs to know what happened and what to do next.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We could not load this just now. Please try again in a moment.",
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
      role="alert"
    >
      <span className="bg-destructive/10 text-destructive flex size-11 items-center justify-center rounded-full">
        <TriangleAlert className="size-5" aria-hidden />
      </span>
      <div className="grid gap-1">
        <h3 className="text-base font-medium">{title}</h3>
        <p className="text-muted-foreground mx-auto max-w-sm text-sm">{description}</p>
      </div>
      {action ? <div className="mt-2 w-full max-w-xs">{action}</div> : null}
    </div>
  );
}
