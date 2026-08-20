import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import type { Metric } from "@/features/dashboard/queries";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AttentionCardProps = {
  label: string;
  metric: Metric;
  href: string;
  icon: LucideIcon;
  /** What the number means, in the reader's terms. */
  description?: string;
  actionLabel?: string;
};

/**
 * One actionable card: a figure, what it means, and the way to act on it.
 *
 * Renders three honestly distinct states — a real figure, a figure that could
 * not be loaded, and a figure whose data does not exist yet — so a reader is
 * never shown a number the system cannot actually stand behind.
 */
export function AttentionCard({
  label,
  metric,
  href,
  icon: Icon,
  description,
  actionLabel = "View",
}: AttentionCardProps) {
  const isPending = metric.status === "pending";

  const body = (
    <CardContent className="flex items-start gap-4">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          isPending ? "bg-muted text-muted-foreground" : "bg-secondary text-secondary-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>

      <div className="grid flex-1 gap-0.5">
        <span className="text-muted-foreground text-sm">{label}</span>

        {metric.status === "ok" ? (
          <span data-numeric className="text-2xl leading-tight font-semibold">
            {metric.value}
          </span>
        ) : null}

        {metric.status === "error" ? (
          <span className="text-destructive text-sm">Could not be loaded</span>
        ) : null}

        {metric.status === "pending" ? (
          <span className="text-muted-foreground text-sm">
            {`Available in phase ${metric.phase}`}
          </span>
        ) : null}

        {description ? (
          <span className="text-muted-foreground text-sm">{description}</span>
        ) : null}
      </div>

      {!isPending ? (
        <span className="text-muted-foreground inline-flex items-center gap-1 self-center text-sm">
          {actionLabel}
          <ArrowRight className="size-4" aria-hidden />
        </span>
      ) : null}
    </CardContent>
  );

  if (isPending) {
    return (
      <Card className="border-dashed opacity-90">
        {body}
        <span className="sr-only">Not available yet</span>
      </Card>
    );
  }

  return (
    <Card className="hover:border-ring focus-within:border-ring transition-colors">
      <Link href={href} className="block rounded-[inherit] focus:outline-none">
        {body}
      </Link>
    </Card>
  );
}
