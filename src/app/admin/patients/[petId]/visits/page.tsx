import type { Metadata } from "next";

import { PetVisitHistory } from "@/components/soap/pet-visit-history";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Visit history · TV Care" };

export default async function AdminPetVisitsPage({ params }: PageProps<"/admin/patients/[petId]/visits">) {
  await requireRole("admin", "super_admin");
  const { petId } = await params;

  return <PetVisitHistory petId={petId} basePath={`/admin/patients/${petId}/visits`} />;
}
