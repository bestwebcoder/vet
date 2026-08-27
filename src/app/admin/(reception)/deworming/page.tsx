import { Worm } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ACCESS } from "@/features/auth/access";
import { requireRole } from "@/features/auth/session";
import { listPracticeDewormingStatuses } from "@/features/deworming/queries";
import { dueStatusBadgeVariant, getDueInfo } from "@/lib/due-window";

export const metadata: Metadata = { title: "Deworming · TV Care" };

const PAGE_SIZE = 25;

export default async function AdminDewormingPage({ searchParams }: PageProps<"/admin/deworming">) {
  await requireRole(...ACCESS.reception);

  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;

  const result = await listPracticeDewormingStatuses();

  const allDueThisWeek =
    result.status === "ok"
      ? result.data
          .map((row) => ({ ...row, due: getDueInfo(row.nextDueDate) }))
          .filter((row) => ["due_in_7", "due_today", "overdue"].includes(row.due.status))
          .sort((a, b) => (a.due.daysUntil ?? 0) - (b.due.daysUntil ?? 0))
      : [];
  // A page beyond the end is clamped to the last one rather than rendered
  // blank: with a single page of results the control hides itself, so an
  // out-of-range ?page would otherwise be a dead end with no way back.
  const totalPages = Math.max(1, Math.ceil((allDueThisWeek.length) / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const dueThisWeek = allDueThisWeek.slice(start, start + PAGE_SIZE);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Deworming</h1>
        <p className="text-muted-foreground">Patients due or overdue for deworming this week.</p>
      </div>

      <Card>
        <CardContent className="grid gap-4">
          {result.status === "error" ? (
            <ErrorState title="Deworming records could not be loaded" />
          ) : allDueThisWeek.length === 0 ? (
            <EmptyState icon={Worm} title="Nothing due this week" description="No patient is due or overdue for deworming." />
          ) : (
            <>
              <ul className="divide-border grid divide-y">
                {dueThisWeek.map((row) => (
                  <li key={row.petId}>
                    <Link
                      href={`/admin/patients/${row.petId}/deworming`}
                      className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 items-center gap-4 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <div className="grid flex-1 gap-0.5">
                        <span className="text-sm font-medium">{row.petName}</span>
                        <span className="text-muted-foreground text-sm">{row.product}</span>
                      </div>
                      <Badge variant={dueStatusBadgeVariant(row.due.status)}>{row.due.label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination
                basePath="/admin/deworming"
                searchParams={{}}
                page={currentPage}
                pageSize={PAGE_SIZE}
                totalCount={allDueThisWeek.length}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
