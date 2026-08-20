import { CalendarDays, PawPrint, Plus, Receipt, Syringe } from "lucide-react";
import Link from "next/link";

import { AttentionCard } from "@/components/dashboard/attention-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { PetCard } from "@/components/pets/pet-card";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listPets, signedPhotoUrl } from "@/features/pets/queries";
import { firstName } from "@/lib/names";
import type { Metric } from "@/features/dashboard/queries";

export default async function ClientDashboardPage() {
  const user = await requireRole("client");
  const pets = await listPets();

  const photos =
    pets.status === "ok"
      ? await Promise.all(pets.data.map((pet) => signedPhotoUrl(pet.photoPath)))
      : [];

  const petMetric: Metric =
    pets.status === "ok" ? { status: "ok", value: pets.data.length } : { status: "error" };

  return (
    <div className="grid gap-8">
      <DashboardHeader
        title={`Welcome, ${firstName(user.fullName)}`}
        subtitle="Your pets, appointments and records in one place."
      />

      <section className="grid gap-4">
        <h2 className="sr-only">Needs attention</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <AttentionCard label="My pets" metric={petMetric} href="/client/pets" icon={PawPrint} />
          <AttentionCard
            label="Upcoming appointments"
            metric={{ status: "pending", phase: 3 }}
            href="/client/appointments"
            icon={CalendarDays}
          />
          <AttentionCard
            label="Vaccinations due"
            metric={{ status: "pending", phase: 6 }}
            href="/client/vaccinations"
            icon={Syringe}
          />
          <AttentionCard
            label="Unpaid invoices"
            metric={{ status: "pending", phase: 7 }}
            href="/client/invoices"
            icon={Receipt}
          />
        </div>
      </section>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium">My pets</h2>
          {pets.status === "ok" && pets.data.length > 0 ? (
            <Link
              href="/client/pets/new"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Plus aria-hidden />
              Add a pet
            </Link>
          ) : null}
        </div>

        {pets.status === "error" ? (
          <Card>
            <CardContent>
              <ErrorState
                title="Your pets could not be loaded"
                description="Please try again in a moment. Their records are unaffected."
              />
            </CardContent>
          </Card>
        ) : pets.data.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={PawPrint}
                title="No pets yet"
                description="Add your pet to keep their records, prescriptions and vaccinations in one place."
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
          <div className="grid gap-4 sm:grid-cols-2">
            {pets.data.map((pet, index) => (
              <PetCard
                key={pet.id}
                pet={pet}
                photoUrl={photos[index] ?? null}
                href={`/client/pets/${pet.id}`}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
