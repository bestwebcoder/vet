import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PetForm } from "@/components/pets/pet-form";
import { requireRole } from "@/features/auth/session";
import { getClientRecord } from "@/features/clients/queries";
import { createPetAction } from "@/features/pets/actions";
import { listBreeds, listSpecies } from "@/features/pets/queries";

export const metadata: Metadata = { title: "Add a patient · TV Care" };

export default async function NewPatientForClientPage({
  params,
}: PageProps<"/admin/clients/[clientId]/pets/new">) {
  await requireRole("admin", "super_admin");
  const { clientId } = await params;

  const client = await getClientRecord(clientId);
  if (client.status === "error" || !client.data) notFound();

  const [species, breeds] = await Promise.all([listSpecies(), listBreeds()]);

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <h1>Add a patient</h1>
        <p className="text-muted-foreground">
          For {client.data.fullName} ·{" "}
          <Link href={`/admin/clients/${clientId}`} className="underline underline-offset-4">
            Back to client
          </Link>
        </p>
      </div>

      <PetForm
        action={createPetAction}
        species={species}
        breeds={breeds}
        clientId={clientId}
        recordHrefBase="/admin/patients"
        submitLabel="Add patient"
      />
    </div>
  );
}
