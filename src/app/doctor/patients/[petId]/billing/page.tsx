import type { Metadata } from "next";

import { PetBillingSummary } from "@/components/invoices/pet-billing-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Billing · TV Care" };

export default async function DoctorPetBillingPage({ params }: PageProps<"/doctor/patients/[petId]/billing">) {
  await requireRole("doctor");
  const { petId } = await params;

  return <PetBillingSummary petId={petId} linkBasePath="/doctor/invoices" />;
}
