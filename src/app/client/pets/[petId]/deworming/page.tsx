import type { Metadata } from "next";

import { PetDewormingSummary } from "@/components/deworming/pet-deworming-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Deworming · TV Care" };

export default async function ClientPetDewormingPage({ params }: PageProps<"/client/pets/[petId]/deworming">) {
  await requireRole("client");
  const { petId } = await params;

  return <PetDewormingSummary petId={petId} />;
}
