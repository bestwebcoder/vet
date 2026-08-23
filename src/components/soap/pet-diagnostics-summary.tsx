import { format } from "date-fns";
import { FlaskConical } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { signedDocumentUrl } from "@/features/documents/queries";
import { listDiagnosticsForPet } from "@/features/soap/queries";

const STATUS_LABEL: Record<string, string> = {
  ordered: "Ordered",
  in_progress: "In progress",
  completed: "Completed",
};

/** Read-only — ordering and updating a test happens from the visit's SOAP page. */
export async function PetDiagnosticsSummary({ petId }: { petId: string }) {
  const result = await listDiagnosticsForPet(petId);

  if (result.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Diagnostics could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  if (result.data.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={FlaskConical}
            title="No diagnostic tests yet"
            description="Tests ordered during a visit will appear here, with their results once available."
          />
        </CardContent>
      </Card>
    );
  }

  const reportLinks = await Promise.all(
    result.data.map((test) => (test.documentStoragePath ? signedDocumentUrl(test.documentStoragePath) : null)),
  );

  return (
    <Card>
      <CardContent className="grid gap-3">
        {result.data.map((test, index) => (
          <div key={test.id} className="grid gap-1 rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{test.testName}</span>
              <Badge variant={test.status === "completed" ? "default" : "secondary"}>
                {STATUS_LABEL[test.status] ?? test.status}
              </Badge>
            </div>
            <span className="text-muted-foreground text-xs" data-numeric>
              {test.testType ? `${test.testType} · ` : ""}
              Ordered {format(new Date(test.orderedAt), "d MMM yyyy")}
            </span>
            {test.resultNotes ? <p className="text-sm">{test.resultNotes}</p> : null}
            {reportLinks[index] ? (
              <a
                href={reportLinks[index]!}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline underline-offset-4"
              >
                {test.documentFileName ?? "View report"}
              </a>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
