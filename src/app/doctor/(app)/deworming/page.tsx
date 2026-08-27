import { Worm } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listPracticeDewormingStatuses } from "@/features/deworming/queries";
import { dueStatusBadgeVariant, getDueInfo } from "@/lib/due-window";

export const metadata: Metadata = { title: "Deworming · TV Care" };

/** Long enough to scan, short enough to render on a phone. */
const PAGE_SIZE = 25;

export default async function DoctorDewormingPage({ searchParams }: PageProps<"/doctor/deworming">) {
  await requireRole("doctor");

  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;

  const result = await listPracticeDewormingStatuses();

  const due =
    result.status === "ok"
      ? result.data
          .map((row) => ({ ...row, due: getDueInfo(row.nextDueDate) }))
          .filter((row) => row.due.status !== "none" && row.due.status !== "upcoming")
          .sort((a, b) => (a.due.daysUntil ?? 0) - (b.due.daysUntil ?? 0))
      : [];

  const total = due.length;
  // A page beyond the end is clamped to the last one rather than rendered
  // blank: with a single page of results the control hides itself, so an
  // out-of-range ?page would otherwise be a dead end with no way back.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = due.slice(start, start + PAGE_SIZE);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Deworming</h1>
        <p className="text-muted-foreground">Patients due or overdue for their next deworming, soonest first.</p>
      </div>

      <Card>
        <CardContent className="grid gap-4">
          {result.status === "error" ? (
            <ErrorState title="Deworming records could not be loaded" />
          ) : due.length === 0 ? (
            <EmptyState icon={Worm} title="Nothing due" description="No patient is due for deworming in the next 30 days." />
          ) : (
            <ul className="divide-border grid divide-y">
              {visible.map((row) => (
                <li key={row.petId}>
                  <Link
                    href={`/doctor/patients/${row.petId}/deworming`}
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
          )}
        
          <Pagination
            basePath="/doctor/deworming"
            searchParams={{}}
            page={currentPage}
            pageSize={PAGE_SIZE}
            totalCount={total}
          />
        </CardContent>
      </Card>
    </div>
  );
}
