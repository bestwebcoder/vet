import type { Metadata } from "next";

import { PetDewormingSummary } from "@/components/deworming/pet-deworming-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Deworming · TV Care" };

export default async function AdminPetDewormingPage({ params }: PageProps<"/admin/patients/[petId]/deworming">) {
  await requireRole("admin", "super_admin");
  const { petId } = await params;

  return <PetDewormingSummary petId={petId} />;
}
