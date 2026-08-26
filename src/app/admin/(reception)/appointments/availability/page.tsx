import type { Metadata } from "next";
import Link from "next/link";

import { DoctorAvailabilityCard } from "@/components/appointments/availability-manager";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { ACCESS } from "@/features/auth/access";
import { requireRole } from "@/features/auth/session";
import { listAvailabilityForDoctor } from "@/features/appointments/queries";
import { listBranches } from "@/features/clients/queries";
import { listDoctors } from "@/features/doctors/queries";

export const metadata: Metadata = { title: "Doctor availability · TV Care" };

export default async function AvailabilityAdminPage() {
  await requireRole(...ACCESS.reception);

  const [doctors, branches] = await Promise.all([listDoctors(), listBranches()]);

  if (doctors.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Doctors could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  const windowsByDoctor = await Promise.all(
    doctors.data.map((doctor) => listAvailabilityForDoctor(doctor.id)),
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Doctor availability</h1>
        <p className="text-muted-foreground">
          <Link href="/admin/appointments" className="underline underline-offset-4">
            Back to appointments
          </Link>
        </p>
        <p className="text-muted-foreground text-sm">
          The working days, hours and breaks each doctor is bookable for. A gap between two windows on
          the same day is a break — add a morning window and an afternoon window to leave one out.
        </p>
      </div>

      {doctors.data.length === 0 ? (
        <Card>
          <CardContent>
            <ErrorState
              title="No doctors yet"
              description="Doctors are added to the practice before their availability can be configured."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {doctors.data.map((doctor, index) => (
            <DoctorAvailabilityCard
              key={doctor.id}
              doctorId={doctor.id}
              doctorName={doctor.fullName}
              windows={windowsByDoctor[index].status === "ok" ? windowsByDoctor[index].data : []}
              branches={branches}
            />
          ))}
        </div>
      )}
    </div>
  );
}
