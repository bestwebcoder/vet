import type { Metadata } from "next";

import { AuditLog } from "@/components/data/audit-log";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getAuditActors, getAuditLog } from "@/features/data/queries";

export const metadata: Metadata = { title: "Audit log · TV Care" };

/** A filter value only counts if it is a single string — `?table=a&table=b` is not a filter. */
function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function AdminDataAuditPage({ searchParams }: PageProps<"/admin/data/audit">) {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Your account is not linked to a practice yet" />
        </CardContent>
      </Card>
    );
  }

  const params = await searchParams;
  const filters = {
    entityTable: one(params.table),
    actorUserId: one(params.actor),
    from: one(params.from),
    to: one(params.to),
    page: Number(one(params.page) ?? 1) || 1,
  };

  const [log, actors] = await Promise.all([
    getAuditLog(organizationId, filters),
    getAuditActors(organizationId),
  ]);

  if (log.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="The audit log could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <AuditLog
      entries={log.data.entries}
      actors={actors.status === "ok" ? actors.data : []}
      total={log.data.total}
      page={log.data.page}
      pageSize={log.data.pageSize}
      // Only the filters, so paging preserves them and never carries a stale
      // page number of its own.
      searchParams={{
        table: filters.entityTable,
        actor: filters.actorUserId,
        from: filters.from,
        to: filters.to,
      }}
    />
  );
}
