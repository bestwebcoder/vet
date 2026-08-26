import type { Metadata } from "next";
import Link from "next/link";

import { OwnerChooser } from "@/components/pets/owner-chooser";
import { PetForm } from "@/components/pets/pet-form";
import { requireRole } from "@/features/auth/session";
import { listClients } from "@/features/clients/queries";
import { createPetAction } from "@/features/pets/actions";
import { listBreeds, listSpecies } from "@/features/pets/queries";

export const metadata: Metadata = { title: "Add a patient · TV Care" };

export default async function DoctorNewPatientPage() {
  const user = await requireRole("doctor");

  const [species, breeds, clients] = await Promise.all([
    listSpecies(),
    listBreeds(),
    listClients({ limit: 500 }),
  ]);

  const owners =
    clients.status === "ok"
      ? clients.data.map((client) => ({
          id: client.id,
          name: client.fullName,
          phone: client.phone,
        }))
      : [];

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <h1>Add a patient</h1>
        <p className="text-muted-foreground">
          <Link href="/doctor/patients" className="underline underline-offset-4">
            Back to patients
          </Link>
        </p>
      </div>

      <PetForm
        action={createPetAction}
        species={species}
        breeds={breeds}
        ownerSection={
          <OwnerChooser clients={owners} organizationId={user.organizationIds[0]} />
        }
        submitLabel="Add patient"
      />
    </div>
  );
}
