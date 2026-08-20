import { FileText, ImageIcon } from "lucide-react";

import { formatFileSize, signedDocumentUrl, type PetDocument } from "@/features/documents/queries";
import { EmptyState } from "@/components/states/empty-state";

const DHAKA_DATE = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Asia/Dhaka",
});

/**
 * Documents attached to a patient.
 *
 * Links are signed at render time and expire; the bucket is private, so a URL
 * copied out of the page stops working rather than becoming a permanent
 * unauthenticated route to a clinical file.
 */
export async function DocumentList({
  documents,
  showVisibility = false,
}: {
  documents: PetDocument[];
  /** Clinic-side views show whether the owner can see each file. */
  showVisibility?: boolean;
}) {
  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No documents yet"
        description="Vaccination cards, lab reports and photographs of anything you want the vet to see can be kept here."
      />
    );
  }

  const links = await Promise.all(documents.map((doc) => signedDocumentUrl(doc.storagePath)));

  return (
    <ul className="divide-border grid divide-y">
      {documents.map((document, index) => {
        const Icon = document.mimeType.startsWith("image/") ? ImageIcon : FileText;
        const href = links[index];

        return (
          <li key={document.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className="bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
              <Icon className="size-4" aria-hidden />
            </span>

            <div className="grid flex-1 gap-0.5">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium underline underline-offset-4"
                >
                  {document.fileName}
                </a>
              ) : (
                <span className="text-sm font-medium">{document.fileName}</span>
              )}

              {document.description ? (
                <span className="text-muted-foreground text-sm">{document.description}</span>
              ) : null}

              <span className="text-muted-foreground text-xs" data-numeric>
                {DHAKA_DATE.format(new Date(document.uploadedAt))} ·{" "}
                {formatFileSize(document.sizeBytes)}
                {document.uploadedByName ? ` · ${document.uploadedByName}` : ""}
              </span>

              {showVisibility ? (
                <span className="text-muted-foreground text-xs">
                  {document.isClientVisible ? "Shared with the owner" : "Not shared with the owner"}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
