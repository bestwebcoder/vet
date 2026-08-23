import { PawPrint } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BookingForm } from "@/components/appointments/booking-form";
import { EmptyState } from "@/components/states/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listDoctors } from "@/features/doctors/queries";
import { requireRole } from "@/features/auth/session";
import { listPets } from "@/features/pets/queries";
import { listServices } from "@/features/services/queries";

export const metadata: Metadata = { title: "Book an appointment · TV Care" };

export default async function NewClientAppointmentPage({
  searchParams,
}: PageProps<"/client/appointments/new">) {
  await requireRole("client");
  const { petId } = await searchParams;

  const [pets, services, doctors] = await Promise.all([
    listPets(),
    listServices(),
    listDoctors({ onlyAccepting: true }),
  ]);

  const petOptions = pets.status === "ok" ? pets.data.map((pet) => ({ id: pet.id, name: pet.name })) : [];

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <h1>Book an appointment</h1>
        <p className="text-muted-foreground">
          <Link href="/client/appointments" className="underline underline-offset-4">
            Back to appointments
          </Link>
        </p>
      </div>

      {petOptions.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={PawPrint}
              title="Add a pet first"
              description="An appointment is booked for a specific pet — add yours before booking a visit."
              action={
                <Link
                  href="/client/pets/new"
                  className={buttonVariants({ size: "touch", className: "w-full" })}
                >
                  Add a pet
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <BookingForm
          pets={petOptions}
          defaultPetId={typeof petId === "string" ? petId : undefined}
          services={services.status === "ok" ? services.data.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes })) : []}
          doctors={doctors.status === "ok" ? doctors.data.map((doctor) => ({ id: doctor.id, name: doctor.fullName })) : []}
          successHref="/client/appointments"
        />
      )}
    </div>
  );
}
