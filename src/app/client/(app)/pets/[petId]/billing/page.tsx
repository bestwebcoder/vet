import type { Metadata } from "next";

import { PetBillingSummary } from "@/components/invoices/pet-billing-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Billing · TV Care" };

export default async function ClientPetBillingPage({ params }: PageProps<"/client/pets/[petId]/billing">) {
  await requireRole("client");
  const { petId } = await params;

  return <PetBillingSummary petId={petId} />;
}
