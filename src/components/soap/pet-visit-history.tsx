import { VisitHistoryList } from "@/components/soap/visit-history-list";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { listSoapRecordsForPet } from "@/features/soap/queries";

export async function PetVisitHistory({ petId, basePath }: { petId: string; basePath: string }) {
  const records = await listSoapRecordsForPet(petId);

  if (records.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Visit history could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <VisitHistoryList records={records.data} basePath={basePath} />
      </CardContent>
    </Card>
  );
}
