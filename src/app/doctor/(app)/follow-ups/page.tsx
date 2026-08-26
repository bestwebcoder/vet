import { format } from "date-fns";
import { CalendarPlus, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { listFollowUpsDueForDoctor } from "@/features/soap/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Follow-ups due · TV Care" };

export default async function DoctorFollowUpsPage() {
  await requireRole("doctor");

  const doctor = await getOwnDoctorRecord();

  if (doctor.status === "error" || !doctor.data) {
    return (
      <Card>
        <CardContent>
          <ErrorState
            title="We could not load your follow-ups"
            description="Your doctor record could not be found. Please contact your administrator."
          />
        </CardContent>
      </Card>
    );
  }

  const dueResult = await listFollowUpsDueForDoctor(doctor.data.id);

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
              {dueResult.data.map((record) => (
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
        </CardContent>
      </Card>
    </div>
  );
}
