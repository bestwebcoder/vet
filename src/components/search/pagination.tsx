import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Page numbers to show around the current one, plus first/last, with a "…"
 * marker filling any gap — the usual "1 2 3 … 10" / "1 … 4 5 6 … 10" shape.
 * `delta` is how many pages either side of the current one to keep.
 */
function pageWindow(current: number, total: number, delta = 1): (number | "…")[] {
  const pages = new Set<number>([1, total]);
  for (let p = current - delta; p <= current + delta; p++) {
    if (p >= 1 && p <= total) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const withGaps: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) withGaps.push("…");
    withGaps.push(sorted[i]);
  }
  return withGaps;
}

/**
 * Numbered pagination as plain links, not client state — a page number
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
  pageParam = "page",
}: {
  basePath: string;
  /** Every other filter on the page (status, from, to, q, …), preserved across page changes. */
  searchParams: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  totalCount: number;
  /** The query param this control reads/writes — override when a page has two independent lists to paginate. */
  pageParam?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  function href(targetPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value);
    }
    if (targetPage > 1) params.set(pageParam, String(targetPage));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  function arrow(targetPage: number, disabled: boolean, children: React.ReactNode, label: string) {
    if (disabled) {
      return (
        <span
          className={cn(buttonVariants({ variant: "outline", size: "icon" }), "pointer-events-none opacity-50")}
          aria-disabled
          aria-label={label}
        >
          {children}
        </span>
      );
    }
    return (
      <Link href={href(targetPage)} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label={label}>
        {children}
      </Link>
    );
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-muted-foreground text-sm">
        Page {page} of {totalPages} · {totalCount} total
      </p>
      <div className="flex items-center gap-1.5">
        {arrow(page - 1, page <= 1, <ChevronLeft aria-hidden />, "Previous page")}

        {pageWindow(page, totalPages).map((item, index) =>
          item === "…" ? (
            <span key={`gap-${index}`} className="text-muted-foreground px-1.5 text-sm select-none">
              …
            </span>
          ) : (
            <Link
              key={item}
              href={href(item)}
              aria-current={item === page ? "page" : undefined}
              className={buttonVariants({
                variant: item === page ? "default" : "outline",
                size: "icon",
                className: "text-sm",
              })}
            >
              {item}
            </Link>
          ),
        )}

        {arrow(page + 1, page >= totalPages, <ChevronRight aria-hidden />, "Next page")}
      </div>
    </nav>
  );
}
