import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentList } from "@/components/documents/document-list";
import { DocumentUploadForm } from "@/components/documents/upload-form";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listDocuments } from "@/features/documents/queries";
import { getPet } from "@/features/pets/queries";

export const metadata: Metadata = { title: "Documents · TV Care" };

export default async function PetDocumentsPage({
  params,
}: PageProps<"/client/pets/[petId]/documents">) {
  await requireRole("client");
  const { petId } = await params;

  const pet = await getPet(petId);
  if (pet.status === "error" || !pet.data) notFound();

  const documents = await listDocuments(petId);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
          <CardDescription>
            Files you have uploaded, and anything your clinic has shared with you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documents.status === "error" ? (
            <ErrorState
              title="Documents could not be loaded"
              description="Please try again in a moment. Nothing has been lost."
            />
          ) : (
            <DocumentList documents={documents.data} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a document</CardTitle>
          <CardDescription>
            Anything you would like the vet to see — a vaccination card, a previous clinic&apos;s
            report, or a photograph of a symptom.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUploadForm petId={petId} />
        </CardContent>
      </Card>
    </div>
  );
}
