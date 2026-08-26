import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading placeholders shaped like the content they replace, so the layout
 * does not jump when data arrives.
 */

export function LoadingState({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("grid gap-3 py-8", className)} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

export function CardListSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4", className)} role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="bg-card rounded-lg border p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-3 h-3 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3", className)} role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }, (_, columnIndex) => (
            <Skeleton key={columnIndex} className="h-4" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The whole-page placeholder for a route segment's loading.tsx.
 *
 * Not yet wired to one. Adding `loading.tsx` under /admin, /doctor or /client
 * makes that segment stream, which turns a page-level redirect() or
 * notFound() into HTTP 200 with the redirect delivered in the streamed payload
 * — a browser still lands in the right place, but an unauthorized request
 * stops answering 307, which monitoring and tests/routes.test.ts both rely on.
 * (Layout-level guards keep their 307, so they are unaffected.)
 *
 * Wiring this up therefore means moving the per-page requireRole calls into
 * per-section layouts first. Kept here, ready, so that work does not also have
 * to design the placeholder.
 */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-6" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div className="grid gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>

      <div className="bg-card ring-foreground/10 grid gap-4 rounded-xl p-4 ring-1">
        <TableSkeleton rows={rows} columns={3} />
      </div>
    </div>
  );
}
