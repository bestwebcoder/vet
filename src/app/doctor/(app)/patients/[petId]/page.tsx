import { notFound } from "next/navigation";

import { PetOverview } from "@/components/pets/pet-overview";
import { requireRole } from "@/features/auth/session";
import { getClientRecord } from "@/features/clients/queries";
import { getPet } from "@/features/pets/queries";

export default async function DoctorPatientOverviewPage({
  params,
}: PageProps<"/doctor/patients/[petId]">) {
  await requireRole("doctor");
  const { petId } = await params;

  const result = await getPet(petId);
  if (result.status === "error" || !result.data) notFound();

  const owner = await getClientRecord(result.data.clientId);

  return (
    <PetOverview
      pet={result.data}
      owner={
        owner.status === "ok" && owner.data
          ? {
              name: owner.data.fullName,
              phone: owner.data.phone,
              href: `/doctor/patients/${petId}/owner`,
            }
          : undefined
      }
    />
  );
}
