import type { Metadata } from "next";

import { PetVisitHistory } from "@/components/soap/pet-visit-history";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Visit history · TV Care" };

export default async function DoctorPetVisitsPage({ params }: PageProps<"/doctor/patients/[petId]/visits">) {
  await requireRole("doctor");
  const { petId } = await params;

  return <PetVisitHistory petId={petId} basePath={`/doctor/patients/${petId}/visits`} />;
}
