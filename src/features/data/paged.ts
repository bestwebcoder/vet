import type { createClient } from "@/lib/supabase/server";

/**
 * Reading a whole table, a page at a time.
 *
 * PostgREST caps a response at 1000 rows and says so only in the Content-Range
 * header — a query for a practice's 4000 appointments returns 1000 of them and
 * no error at all. A backup built on that would be quietly, catastrophically
 * incomplete, so nothing in this feature reads a table without going through
 * here.
 */

export type Client = Awaited<ReturnType<typeof createClient>>;
export type Row = Record<string, unknown>;

/**
 * The builder `from(table).select(...)` hands back. Named because the paging
 * loop rebuilds the query for each page, so a per-table filter has to travel
 * as a function rather than as an already-built query.
 */
export type Query = ReturnType<ReturnType<Client["from"]>["select"]>;
export type Refine = (query: Query) => Query;

export const PAGE_SIZE = 1000;

/**
 * How many ids go into one `in.(…)` filter. They are UUIDs, so 150 is roughly
 * 5.5 kB of query string — comfortably inside every proxy's URL limit, and few
 * enough round trips to stay quick.
 */
export const ID_CHUNK = 150;

export const identity: Refine = (query) => query;

/** Every row the caller may see, ordered by `orderBy` so paging is stable. */
export async function fetchPaged(
  client: Client,
  table: string,
  columns: string,
  refine: Refine = identity,
  orderBy = "id",
): Promise<Row[]> {
  const rows: Row[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await refine(client.from(table).select(columns))
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`${table}: ${error.message}`);

    const page = (data ?? []) as Row[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) return rows;
  }
}

/** Rows whose `column` matches any of `values`, fetched in url-sized batches. */
export async function fetchIn(
  client: Client,
  table: string,
  columns: string,
  column: string,
  values: string[],
  orderBy = "id",
): Promise<Row[]> {
  const rows: Row[] = [];

  for (let index = 0; index < values.length; index += ID_CHUNK) {
    const batch = values.slice(index, index + ID_CHUNK);
    rows.push(...(await fetchPaged(client, table, columns, (query) => query.in(column, batch), orderBy)));
  }

  return rows;
}

/** Splits an array into chunks small enough for one request. */
export function chunk<T>(values: T[], size = ID_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
