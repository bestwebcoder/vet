import { format } from "date-fns";
import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { listDraftSoapRecordsForDoctor } from "@/features/soap/queries";

export const metadata: Metadata = { title: "SOAP records · TV Care" };

/** Long enough to scan, short enough to render on a phone. */
const PAGE_SIZE = 25;

export default async function DoctorSoapWorklistPage({ searchParams }: PageProps<"/doctor/soap">) {
  await requireRole("doctor");

  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;

  const doctor = await getOwnDoctorRecord();

  if (doctor.status === "error" || !doctor.data) {
    return (
      <Card>
        <CardContent className="grid gap-4">
          <ErrorState
            title="We could not load your SOAP records"
            description="Your doctor record could not be found. Please contact your administrator."
          />
        </CardContent>
      </Card>
    );
  }

  const drafts = await listDraftSoapRecordsForDoctor(doctor.data.id);

  const total = drafts.status === "ok" ? drafts.data.length : 0;
  // A page beyond the end is clamped to the last one rather than rendered
  // blank: with a single page of results the control hides itself, so an
  // out-of-range ?page would otherwise be a dead end with no way back.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = drafts.status === "ok" ? drafts.data.slice(start, start + PAGE_SIZE) : [];

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>SOAP records</h1>
        <p className="text-muted-foreground">
          Records are started from an appointment — open a patient&apos;s visit to begin one.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drafts to complete</CardTitle>
        </CardHeader>
        <CardContent>
          {drafts.status === "error" ? (
            <ErrorState title="Drafts could not be loaded" />
          ) : drafts.data.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No drafts waiting"
              description="Every SOAP record you have started has been finalized."
            />
          ) : (
            <ul className="divide-border grid divide-y">
              {visible.map((record) => (
                <li key={record.id}>
                  <Link
                    href={`/doctor/appointments/${record.appointmentId}/soap`}
                    className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 items-center gap-4 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="grid flex-1 gap-0.5">
                      <span className="text-sm font-medium">{record.petName}</span>
                      <span className="text-muted-foreground text-sm">
                        {record.chiefComplaint ?? "No chief complaint recorded yet"}
                      </span>
                    </div>
                    <span className="text-muted-foreground text-xs" data-numeric>
                      {format(new Date(record.createdAt), "d MMM")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        
          <Pagination
            basePath="/doctor/soap"
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
