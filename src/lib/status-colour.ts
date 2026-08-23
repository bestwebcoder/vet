/**
 * Maps the `colour` key stored on `appointment_statuses` to Tailwind classes.
 *
 * The status names, order and colour keys themselves are database
 * configuration (see `appointment_statuses` in
 * `supabase/migrations/20260820000700_appointments.sql`), not hard-coded here.
 * This file is only the design system's side of that contract: which visual
 * treatment a given semantic colour key gets. "sage" reuses this app's own
 * secondary/accent tokens rather than a separate green, so a confirmed
 * appointment reads as the same brand green used everywhere else.
 */

const BADGE_CLASSES: Record<string, string> = {
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  sage: "bg-secondary text-secondary-foreground",
  teal: "bg-teal-100 text-teal-900 dark:bg-teal-500/15 dark:text-teal-300",
  blue: "bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300",
  slate: "bg-slate-200 text-slate-900 dark:bg-slate-500/20 dark:text-slate-300",
  grey: "bg-muted text-muted-foreground",
  rose: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300",
};

const DOT_CLASSES: Record<string, string> = {
  amber: "bg-amber-500",
  sage: "bg-primary",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  slate: "bg-slate-500",
  grey: "bg-muted-foreground",
  rose: "bg-rose-500",
};

const FALLBACK_BADGE = "bg-muted text-muted-foreground";
const FALLBACK_DOT = "bg-muted-foreground";

/** Badge background/text classes for a status colour key, e.g. "amber". */
export function statusBadgeClasses(colour: string): string {
  return BADGE_CLASSES[colour] ?? FALLBACK_BADGE;
}

/** A small solid-dot class, for compact calendar entries. */
export function statusDotClasses(colour: string): string {
  return DOT_CLASSES[colour] ?? FALLBACK_DOT;
}
