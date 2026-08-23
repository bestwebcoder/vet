import type { Metadata } from "next";

import { PetPrescriptionList } from "@/components/prescriptions/pet-prescription-list";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Prescriptions · TV Care" };

export default async function DoctorPetPrescriptionsPage({ params }: PageProps<"/doctor/patients/[petId]/prescriptions">) {
  await requireRole("doctor");
  const { petId } = await params;

  return <PetPrescriptionList petId={petId} />;
}
