import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Previous/Next pagination as plain links, not client state — a page number
 * lives in the URL the same way a search term does (search-field.tsx), so a
 * result page can be bookmarked or shared and works before JavaScript has
 * loaded.
 */
export function Pagination({
  basePath,
  searchParams,
  page,
  pageSize,
  totalCount,
}: {
  basePath: string;
  /** Every other filter on the page (status, from, to, q, …), preserved across page changes. */
  searchParams: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  totalCount: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  function href(targetPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value);
    }
    if (targetPage > 1) params.set("page", String(targetPage));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-muted-foreground text-sm">
        Page {page} of {totalPages} · {totalCount} total
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ChevronLeft aria-hidden />
            Previous
          </Link>
        ) : (
          <span
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}
            aria-disabled
          >
            <ChevronLeft aria-hidden />
            Previous
          </span>
        )}

        {page < totalPages ? (
          <Link href={href(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Next
            <ChevronRight aria-hidden />
          </Link>
        ) : (
          <span
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}
            aria-disabled
          >
            Next
            <ChevronRight aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
