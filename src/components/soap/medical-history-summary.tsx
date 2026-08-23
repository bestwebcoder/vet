import { format } from "date-fns";
import { Stethoscope } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDiagnosesForPet, listSoapRecordsForPet } from "@/features/soap/queries";

const KIND_LABEL: Record<string, string> = { differential: "Differential", final: "Final" };

/**
 * The consolidated clinical picture §4.8 asks for — what a doctor reviews
 * before consulting, not the full visit-by-visit record (that's Visit History).
 */
export async function MedicalHistorySummary({ petId }: { petId: string }) {
  const [diagnosesResult, recordsResult] = await Promise.all([
    listDiagnosesForPet(petId),
    listSoapRecordsForPet(petId),
  ]);

  if (diagnosesResult.status === "error" || recordsResult.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Medical history could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  const diagnoses = diagnosesResult.data;
  const vitalsHistory = recordsResult.data.filter(
    (record) =>
      record.temperatureCelsius !== null ||
      record.pulseBpm !== null ||
      record.respiratoryRateBpm !== null ||
      record.weight !== null,
  );

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diagnosis history</CardTitle>
        </CardHeader>
        <CardContent>
          {diagnoses.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title="No diagnoses recorded yet"
              description="Diagnoses recorded during finalized visits will appear here."
            />
          ) : (
            <ul className="grid gap-2">
              {diagnoses.map((diagnosis) => (
                <li key={diagnosis.id} className="flex items-start gap-2 text-sm">
                  <Badge variant="secondary">{KIND_LABEL[diagnosis.kind] ?? diagnosis.kind}</Badge>
                  <span className="flex-1">{diagnosis.description}</span>
                  <span className="text-muted-foreground text-xs" data-numeric>
                    {format(new Date(diagnosis.createdAt), "d MMM yyyy")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vitals trend</CardTitle>
        </CardHeader>
        <CardContent>
          {vitalsHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No vitals recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Temp.</TableHead>
                  <TableHead>Pulse</TableHead>
                  <TableHead>Resp. rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vitalsHistory.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell data-numeric>{format(new Date(record.createdAt), "d MMM yyyy")}</TableCell>
                    <TableCell data-numeric>{record.weight ?? "—"}</TableCell>
                    <TableCell data-numeric>
                      {record.temperatureCelsius ? `${record.temperatureCelsius} °C` : "—"}
                    </TableCell>
                    <TableCell data-numeric>{record.pulseBpm ? `${record.pulseBpm} bpm` : "—"}</TableCell>
                    <TableCell data-numeric>
                      {record.respiratoryRateBpm ? `${record.respiratoryRateBpm}/min` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
