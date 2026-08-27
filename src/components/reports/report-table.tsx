import { Pagination } from "@/components/search/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Enough rows to be useful on a phone without becoming a scroll of its own. */
const REPORT_PAGE_SIZE = 15;

/**
 * §8.5's table presentation.
 *
 * Paginates when given a `pageParam`. Reports are grouped figures — revenue by
 * service, by doctor, most common diagnoses — and how many rows that comes to
 * depends entirely on the practice and the date range asked for: a year across
 * a real service list is not a short table. Rendering all of it was fine for
 * the seeded practice and stops being fine for anyone else.
 *
 * Each table on a page passes its own `pageParam`, because several of them
 * share one screen and paging one must not move the others. Summary tables
 * with a fixed couple of rows pass none and render whole.
 */
export function ReportTable({
  columns,
  rows,
  emptyMessage = "No data for this range.",
  pageParam,
  page = 1,
  basePath,
  searchParams,
}: {
  columns: string[];
  rows: (string | number)[][];
  emptyMessage?: string;
  /** Set to paginate; also the query parameter this table reads and writes. */
  pageParam?: string;
  page?: number;
  basePath?: string;
  /** Every other parameter on the page — the date range above all — kept across page changes. */
  searchParams?: Record<string, string | undefined>;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  const paginated = Boolean(pageParam && basePath);
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * REPORT_PAGE_SIZE;
  const visible = paginated ? rows.slice(start, start + REPORT_PAGE_SIZE) : rows;

  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row, index) => (
              <TableRow key={start + index}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex} data-numeric={typeof cell === "number" ? "" : undefined}>
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {paginated ? (
        <Pagination
          basePath={basePath!}
          searchParams={searchParams ?? {}}
          page={safePage}
          pageSize={REPORT_PAGE_SIZE}
          totalCount={rows.length}
          pageParam={pageParam}
        />
      ) : null}
    </div>
  );
}
