import type { Metadata } from "next";

import { PetPrescriptionList } from "@/components/prescriptions/pet-prescription-list";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Prescriptions · TV Care" };

export default async function ClientPrescriptionsPage({ params }: PageProps<"/client/pets/[petId]/prescriptions">) {
  await requireRole("client");
  const { petId } = await params;

  return <PetPrescriptionList petId={petId} />;
}
