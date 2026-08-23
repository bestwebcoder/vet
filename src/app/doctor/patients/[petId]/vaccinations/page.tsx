import type { Metadata } from "next";

import { PetVaccinationSummary } from "@/components/vaccinations/pet-vaccination-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Vaccinations · TV Care" };

export default async function DoctorPetVaccinationsPage({ params }: PageProps<"/doctor/patients/[petId]/vaccinations">) {
  await requireRole("doctor");
  const { petId } = await params;

  return <PetVaccinationSummary petId={petId} editable />;
}
