import type { Metadata } from "next";

import { PetDewormingSummary } from "@/components/deworming/pet-deworming-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Deworming · TV Care" };

export default async function DoctorPetDewormingPage({ params }: PageProps<"/doctor/patients/[petId]/deworming">) {
  await requireRole("doctor");
  const { petId } = await params;

  return <PetDewormingSummary petId={petId} editable />;
}
