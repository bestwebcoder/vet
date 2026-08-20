import { DocumentList } from "@/components/documents/document-list";
import { DocumentUploadForm } from "@/components/documents/upload-form";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listDocuments } from "@/features/documents/queries";

/**
 * The Documents tab.
 *
 * The clinic view additionally shows whether each file is shared with the
 * owner, because a vet uploading a result needs to know what the owner can
 * already see.
 */
export async function PetDocuments({
  petId,
  audience,
}: {
  petId: string;
  audience: "client" | "clinic";
}) {
  const documents = await listDocuments(petId);
  const isClinic = audience === "clinic";

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
          <CardDescription>
            {isClinic
              ? "Everything attached to this patient, including files the owner cannot see."
              : "Files you have uploaded, and anything your clinic has shared with you."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documents.status === "error" ? (
            <ErrorState
              title="Documents could not be loaded"
              description="Please try again in a moment. Nothing has been lost."
            />
          ) : (
            <DocumentList documents={documents.data} showVisibility={isClinic} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a document</CardTitle>
          <CardDescription>
            {isClinic
              ? "Uploaded files are not shared with the owner until a vet shares them."
              : "Anything you would like the vet to see — a vaccination card, a previous clinic's report, or a photograph of a symptom."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUploadForm petId={petId} />
        </CardContent>
      </Card>
    </div>
  );
}
