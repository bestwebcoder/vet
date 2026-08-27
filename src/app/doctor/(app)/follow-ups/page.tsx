import { format } from "date-fns";
import { CalendarPlus, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { listFollowUpsDueForDoctor } from "@/features/soap/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Follow-ups due · TV Care" };

/** Long enough to scan, short enough to render on a phone. */
const PAGE_SIZE = 25;

export default async function DoctorFollowUpsPage({ searchParams }: PageProps<"/doctor/follow-ups">) {
  await requireRole("doctor");

  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;

  const doctor = await getOwnDoctorRecord();

  if (doctor.status === "error" || !doctor.data) {
    return (
      <Card>
        <CardContent className="grid gap-4">
          <ErrorState
            title="We could not load your follow-ups"
            description="Your doctor record could not be found. Please contact your administrator."
          />
        </CardContent>
      </Card>
    );
  }

  const dueResult = await listFollowUpsDueForDoctor(doctor.data.id);

  const total = dueResult.status === "ok" ? dueResult.data.length : 0;
  // A page beyond the end is clamped to the last one rather than rendered
  // blank: with a single page of results the control hides itself, so an
  // out-of-range ?page would otherwise be a dead end with no way back.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = dueResult.status === "ok" ? dueResult.data.slice(start, start + PAGE_SIZE) : [];

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Follow-ups due</h1>
        <p className="text-muted-foreground">
          Finalized visits that flagged a follow-up, with none booked yet.
        </p>
      </div>

      <Card>
        <CardContent>
          {dueResult.status === "error" ? (
            <ErrorState title="Follow-ups could not be loaded" />
          ) : dueResult.data.length === 0 ? (
            <EmptyState
              icon={History}
              title="Nothing due"
              description="Every flagged follow-up has been scheduled."
            />
          ) : (
            <ul className="divide-border grid divide-y">
              {visible.map((record) => (
                <li key={record.id} className={cn("flex flex-wrap items-center justify-between gap-3 py-3")}>
                  <div className="grid gap-0.5">
                    <span className="text-sm font-medium">{record.petName}</span>
                    <span className="text-muted-foreground text-sm">
                      {record.followUpNotes ?? "No notes given"}
                    </span>
                    <span className="text-muted-foreground text-xs" data-numeric>
                      Finalized {record.finalizedAt ? format(new Date(record.finalizedAt), "d MMM yyyy") : ""}
                    </span>
                  </div>
                  <Link
                    href={`/doctor/appointments/new?petId=${record.petId}&visitType=follow_up&reason=${encodeURIComponent(record.followUpNotes ?? "Follow-up visit")}&soapRecordId=${record.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <CalendarPlus aria-hidden />
                    Schedule
                  </Link>
                </li>
              ))}
            </ul>
          )}
        
          <Pagination
            basePath="/doctor/follow-ups"
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
