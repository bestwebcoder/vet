import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** What the person can do about it. An empty screen with no way forward is a dead end. */
  action?: ReactNode;
  className?: string;
};

/**
 * Shown when a query legitimately returned nothing.
 *
 * Distinct from ErrorState on purpose: "you have no pets yet" and "we could
 * not load your pets" call for different words and different next steps.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="bg-secondary text-secondary-foreground flex size-11 items-center justify-center rounded-full">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <div className="grid gap-1">
        <h3 className="text-base font-medium">{title}</h3>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-2 w-full max-w-xs">{action}</div> : null}
    </div>
  );
}
