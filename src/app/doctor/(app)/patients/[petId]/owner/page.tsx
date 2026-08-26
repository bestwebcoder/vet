import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientForm } from "@/components/clients/client-form";
import { requireRole } from "@/features/auth/session";
import { updateClientAction } from "@/features/clients/actions";
import { getClientRecord, listBranches } from "@/features/clients/queries";
import { getPet } from "@/features/pets/queries";

export const metadata: Metadata = { title: "Owner · TV Care" };

/**
 * A patient's owner, reachable from the patient rather than from a navigation
 * item: §2.2 gives doctors client access, while §8 gives them no Clients
 * section, so the record is opened through the animal being treated.
 */
export default async function DoctorPatientOwnerPage({
  params,
}: PageProps<"/doctor/patients/[petId]/owner">) {
  await requireRole("doctor");
  const { petId } = await params;

  const pet = await getPet(petId);
  if (pet.status === "error" || !pet.data) notFound();

  const [owner, branches] = await Promise.all([
    getClientRecord(pet.data.clientId),
    listBranches(),
  ]);
  if (owner.status === "error" || !owner.data) notFound();

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <h1>{owner.data.fullName}</h1>
        <p className="text-muted-foreground">
          Owner of {pet.data.name} ·{" "}
          <Link href={`/doctor/patients/${petId}`} className="underline underline-offset-4">
            Back to patient
          </Link>
        </p>
      </div>

      <ClientForm
        action={updateClientAction}
        branches={branches}
        client={owner.data}
        submitLabel="Save changes"
      />
    </div>
  );
}
