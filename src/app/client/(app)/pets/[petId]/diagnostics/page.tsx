import type { Metadata } from "next";

import { PetDiagnosticsSummary } from "@/components/soap/pet-diagnostics-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Diagnostics · TV Care" };

export default async function ClientDiagnosticsPage({ params }: PageProps<"/client/pets/[petId]/diagnostics">) {
  await requireRole("client");
  const { petId } = await params;

  return <PetDiagnosticsSummary petId={petId} />;
}
