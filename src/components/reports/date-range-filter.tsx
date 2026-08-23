import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { DateRange } from "@/lib/validation/date-range";

/**
 * §8.5 — every report takes a date range. A plain GET form, same reasoning
 * as `src/components/search/search-field.tsx`: the range lives in the URL,
 * so a filtered report can be linked to a colleague, survives a refresh,
 * and needs no client state.
 */
export function DateRangeFilter({ action, range }: { action: string; range: DateRange }) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3">
      <div className="grid gap-2">
        <Label htmlFor="from">From</Label>
        <input
          type="date"
          id="from"
          name="from"
          defaultValue={range.from}
          className="border-input bg-background h-11 rounded-lg border px-3 text-sm"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="to">To</Label>
        <input
          type="date"
          id="to"
          name="to"
          defaultValue={range.to}
          className="border-input bg-background h-11 rounded-lg border px-3 text-sm"
        />
      </div>
      <Button type="submit" variant="outline" size="touch">
        Apply
      </Button>
    </form>
  );
}
