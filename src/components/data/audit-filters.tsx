"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AUDITED_TABLES } from "@/features/data/tables";

/**
 * Filters that live in the URL rather than in component state, so a filtered
 * view can be bookmarked, shared with a colleague, or reopened after a refresh
 * — the same choice pagination and search already make in this app.
 *
 * A plain GET form would do this with no JavaScript at all, except that it
 * would also carry the page number along with it. Submitting through the
 * router lets a changed filter reset back to page one, which is what a person
 * changing a filter means.
 */
export function AuditFilters({ actors }: { actors: { id: string; name: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function submit(formData: FormData) {
    const next = new URLSearchParams();

    for (const key of ["table", "actor", "from", "to"]) {
      const value = String(formData.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }

    router.push(next.size > 0 ? `/admin/data/audit?${next}` : "/admin/data/audit");
  }

  const selectClass =
    "border-input bg-background min-h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

  return (
    <form action={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="grid gap-2">
        <Label htmlFor="table">Record type</Label>
        <select id="table" name="table" defaultValue={searchParams.get("table") ?? ""} className={selectClass}>
          <option value="">Everything</option>
          {AUDITED_TABLES.map((table) => (
            <option key={table} value={table}>
              {table}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="actor">Who</Label>
        <select id="actor" name="actor" defaultValue={searchParams.get("actor") ?? ""} className={selectClass}>
          <option value="">Anyone</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="from">From</Label>
        <input id="from" name="from" type="date" defaultValue={searchParams.get("from") ?? ""} className={selectClass} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="to">To</Label>
        <input id="to" name="to" type="date" defaultValue={searchParams.get("to") ?? ""} className={selectClass} />
      </div>

      <div className="flex items-end gap-2">
        <Button type="submit" size="touch" variant="outline" className="flex-1">
          Apply
        </Button>
        {searchParams.size > 0 ? (
          <Button type="button" size="touch" variant="ghost" onClick={() => router.push("/admin/data/audit")}>
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  );
}
