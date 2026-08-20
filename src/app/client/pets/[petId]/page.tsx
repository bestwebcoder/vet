import { notFound } from "next/navigation";

import { PetOverview } from "@/components/pets/pet-overview";
import { requireRole } from "@/features/auth/session";
import { getPet } from "@/features/pets/queries";

export default async function PetOverviewPage({ params }: PageProps<"/client/pets/[petId]">) {
  await requireRole("client");
  const { petId } = await params;

  const result = await getPet(petId);
  if (result.status === "error" || !result.data) notFound();

  return <PetOverview pet={result.data} />;
}
