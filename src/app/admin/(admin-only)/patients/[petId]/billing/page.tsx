import type { Metadata } from "next";

import { PetBillingSummary } from "@/components/invoices/pet-billing-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Billing · TV Care" };

export default async function AdminPetBillingPage({ params }: PageProps<"/admin/patients/[petId]/billing">) {
  await requireRole("admin", "super_admin");
  const { petId } = await params;

  return <PetBillingSummary petId={petId} linkBasePath="/admin/invoices" />;
}
