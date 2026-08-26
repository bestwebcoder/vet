import type { Metadata } from "next";

import { PetVisitHistory } from "@/components/soap/pet-visit-history";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Visit history · TV Care" };

export default async function ClientPetVisitsPage({ params }: PageProps<"/client/pets/[petId]/visits">) {
  await requireRole("client");
  const { petId } = await params;

  return <PetVisitHistory petId={petId} basePath={`/client/pets/${petId}/visits`} />;
}
