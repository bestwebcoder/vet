import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * A calendar date range, as a plain GET form — same reasoning as
 * search-field.tsx: it works before JavaScript has loaded, and the range
 * lives in the URL so a filtered view can be bookmarked or shared.
 *
 * Changing the range always goes back to page 1 (submitting a fresh GET
 * form drops any existing `page` param), which is what you want: page 4 of
 * an old range is not a meaningful place to land in a new one.
 */
export function DateRangeFilter({
  action,
  from,
  to,
  preserve = {},
}: {
  action: string;
  from?: string;
  to?: string;
  /** Other filters (status, method, …) to keep applied when the range changes. */
  preserve?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3">
      {Object.entries(preserve).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null,
      )}

      <div className="grid gap-2">
        <Label htmlFor="from">From</Label>
        <Input id="from" type="date" name="from" defaultValue={from} className="h-11 w-40" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="to">To</Label>
        <Input id="to" type="date" name="to" defaultValue={to} className="h-11 w-40" />
      </div>
      <Button type="submit" variant="outline" size="touch">
        Filter
      </Button>
      {from || to ? (
        <Link href={clearHref(action, preserve)} className={buttonVariants({ variant: "ghost", size: "touch" })}>
          Clear dates
        </Link>
      ) : null}
    </form>
  );
}

function clearHref(action: string, preserve: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(preserve)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${action}?${query}` : action;
}
