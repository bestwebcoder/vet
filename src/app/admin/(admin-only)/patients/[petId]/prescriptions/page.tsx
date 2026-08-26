import type { Metadata } from "next";

import { PetPrescriptionList } from "@/components/prescriptions/pet-prescription-list";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Prescriptions · TV Care" };

export default async function AdminPetPrescriptionsPage({ params }: PageProps<"/admin/patients/[petId]/prescriptions">) {
  await requireRole("admin", "super_admin");
  const { petId } = await params;

  return <PetPrescriptionList petId={petId} />;
}
