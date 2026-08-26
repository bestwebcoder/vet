import { PawPrint } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BookingForm } from "@/components/appointments/booking-form";
import { EmptyState } from "@/components/states/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listDoctors } from "@/features/doctors/queries";
import { getPet } from "@/features/pets/queries";
import { listServices } from "@/features/services/queries";

export const metadata: Metadata = { title: "Book an appointment · TV Care" };

export default async function NewDoctorAppointmentPage({
  searchParams,
}: PageProps<"/doctor/appointments/new">) {
  await requireRole("doctor");
  const { petId, visitType, reason, soapRecordId } = await searchParams;

  const pet = typeof petId === "string" ? await getPet(petId) : null;

  if (!pet || pet.status === "error" || !pet.data) {
    return (
      <div className="mx-auto grid w-full max-w-xl gap-6">
        <h1>Book an appointment</h1>
        <Card>
          <CardContent>
            <EmptyState
              icon={PawPrint}
              title="Choose a patient first"
              description="An appointment is booked from a patient's record — open theirs, then book from there."
              action={
                <Link
                  href="/doctor/patients"
                  className={buttonVariants({ size: "touch", className: "w-full" })}
                >
                  Find a patient
                </Link>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const [services, doctors] = await Promise.all([listServices(), listDoctors({ onlyAccepting: true })]);

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <h1>Book an appointment</h1>
        <p className="text-muted-foreground">
          <Link href={`/doctor/patients/${pet.data.id}`} className="underline underline-offset-4">
            Back to {pet.data.name}
          </Link>
        </p>
      </div>

      <BookingForm
        pets={[{ id: pet.data.id, name: pet.data.name }]}
        fixedPet
        defaultVisitType={typeof visitType === "string" ? visitType : undefined}
        defaultReason={typeof reason === "string" ? reason : undefined}
        sourceSoapRecordId={typeof soapRecordId === "string" ? soapRecordId : undefined}
        services={services.status === "ok" ? services.data.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes })) : []}
        doctors={doctors.status === "ok" ? doctors.data.map((doctor) => ({ id: doctor.id, name: doctor.fullName })) : []}
        successHref="/doctor/appointments"
      />
    </div>
  );
}
