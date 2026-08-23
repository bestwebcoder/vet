import type { Metadata } from "next";

import { PetVaccinationSummary } from "@/components/vaccinations/pet-vaccination-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Vaccinations · TV Care" };

export default async function ClientPetVaccinationsPage({ params }: PageProps<"/client/pets/[petId]/vaccinations">) {
  await requireRole("client");
  const { petId } = await params;

  return <PetVaccinationSummary petId={petId} />;
}
