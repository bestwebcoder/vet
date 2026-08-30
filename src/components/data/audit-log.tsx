import { format } from "date-fns";
import { ScrollText } from "lucide-react";

import { AuditFilters } from "@/components/data/audit-filters";
import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuditEntry } from "@/features/data/queries";

/**
 * The audit log, on screen at last.
 *
 * Written by database triggers rather than application code
 * (20260820000200_rls_and_audit.sql), so what is listed here includes changes
 * made outside this application entirely — and the table refuses UPDATE,
 * DELETE and TRUNCATE from every role, service_role included. Nothing on this
 * screen can be edited, because nothing anywhere can.
 */

/** `clients.update` reads better as "Client updated". */
function describe(action: string): string {
  if (action === "auth.login") return "Signed in";

  const [table, operation] = action.split(".");
  const noun = table
    .replace(/_/g, " ")
    .replace(/s$/, "")
    .replace(/^./, (character) => character.toUpperCase());

  if (operation === "insert") return `${noun} created`;
  if (operation === "update") return `${noun} updated`;
  if (operation === "delete") return `${noun} deleted`;
  return action;
}

function fieldLabel(field: string): string {
  return field.replace(/_/g, " ");
}

export function AuditLog({
  entries,
  actors,
  total,
  page,
  pageSize,
  searchParams,
}: {
  entries: AuditEntry[];
  actors: { id: string; name: string }[];
  total: number;
  page: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>
            Every change to a record at this practice, written by the database itself as it happens. It cannot be
            edited or deleted by anyone, including us.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditFilters actors={actors} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4">
          {entries.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Nothing matches those filters"
              description="Try widening the dates, or clearing the filters to see everything."
            />
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
              </p>

              <ul className="divide-border grid divide-y">
                {entries.map((entry) => (
                  <li key={entry.id} className="grid gap-2 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-medium">{describe(entry.action)}</span>
                      {entry.entityTable ? <Badge variant="secondary">{entry.entityTable}</Badge> : null}
                      <span className="text-muted-foreground text-sm">
                        {entry.actorName ?? "The system"} · {format(new Date(entry.createdAt), "d MMM yyyy, HH:mm")}
                      </span>
                    </div>

                    {entry.changes.length > 0 ? (
                      <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
                        {entry.changes.map((change) => (
                          <div key={change.field} className="contents">
                            <dt className="text-muted-foreground">{fieldLabel(change.field)}</dt>
                            <dd className="min-w-0">
                              <span className="text-muted-foreground line-through">{change.from}</span>
                              <span aria-hidden className="text-muted-foreground mx-2">
                                →
                              </span>
                              <span className="break-words">{change.to}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </li>
                ))}
              </ul>

              <Pagination
                basePath="/admin/data/audit"
                searchParams={searchParams}
                page={page}
                pageSize={pageSize}
                totalCount={total}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
