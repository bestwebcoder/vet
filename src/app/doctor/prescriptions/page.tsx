import { format } from "date-fns";
import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { listDraftPrescriptionsForDoctor } from "@/features/prescriptions/queries";

export const metadata: Metadata = { title: "Prescriptions · TV Care" };

export default async function DoctorPrescriptionsWorklistPage() {
  await requireRole("doctor");

  const doctor = await getOwnDoctorRecord();

  if (doctor.status === "error" || !doctor.data) {
    return (
      <Card>
        <CardContent>
          <ErrorState
            title="We could not load your prescriptions"
            description="Your doctor record could not be found. Please contact your administrator."
          />
        </CardContent>
      </Card>
    );
  }

  const drafts = await listDraftPrescriptionsForDoctor(doctor.data.id);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Prescriptions</h1>
        <p className="text-muted-foreground">
          Prescriptions are started from a visit&apos;s finalized SOAP record.
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
              icon={FileText}
              title="No drafts waiting"
              description="Every prescription you have started has been finalized."
            />
          ) : (
            <ul className="divide-border grid divide-y">
              {drafts.data.map((prescription) => (
                <li key={prescription.id}>
                  <Link
                    href={`/doctor/appointments/${prescription.appointmentId}/prescription`}
                    className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 items-center gap-4 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="grid flex-1 gap-0.5">
                      <span className="text-sm font-medium">{prescription.petName}</span>
                      <span className="text-muted-foreground text-sm">
                        {prescription.items.length === 0
                          ? "No medications added yet"
                          : `${prescription.items.length} medication${prescription.items.length === 1 ? "" : "s"}`}
                      </span>
                    </div>
                    <span className="text-muted-foreground text-xs" data-numeric>
                      {format(new Date(prescription.createdAt), "d MMM")}
                    </span>
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
