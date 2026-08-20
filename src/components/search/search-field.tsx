import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Search as a plain GET form.
 *
 * The term lives in the URL, so a result list can be linked to a colleague and
 * survives a refresh — and it works before JavaScript has loaded, which
 * matters on a phone in a rural area.
 */
export function SearchField({
  action,
  defaultValue,
  placeholder,
  label = "Search",
}: {
  action: string;
  defaultValue?: string;
  placeholder: string;
  label?: string;
}) {
  return (
    <form action={action} method="get" className="flex gap-2">
      <div className="relative flex-1">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder={placeholder}
          aria-label={label}
          className="h-11 pl-9"
        />
      </div>
      <Button type="submit" variant="outline" size="touch">
        Search
      </Button>
    </form>
  );
}
