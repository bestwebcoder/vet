import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ExportButtons } from "@/components/reports/export-buttons";
import { ReportBarChart } from "@/components/reports/report-bar-chart";
import { ReportTable } from "@/components/reports/report-table";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFrequentPatients, getPatientSpeciesBreakdown } from "@/features/reports/queries";
import type { DateRange } from "@/lib/validation/date-range";

/** §8.4's three literal buckets — the underlying report stays per-species for reuse elsewhere. */
function groupBySpeciesBucket(rows: { speciesName: string; count: number }[]) {
  let dogs = 0;
  let cats = 0;
  let other = 0;

  for (const row of rows) {
    if (row.speciesName === "Dog") dogs += row.count;
    else if (row.speciesName === "Cat") cats += row.count;
    else other += row.count;
  }

  return [
    { label: "Dogs", value: dogs },
    { label: "Cats", value: cats },
    { label: "Other species", value: other },
  ];
}

/** §8.4 — shared between `/admin/reports/patients` and `/doctor/reports/patients`. */
export async function PatientReportView({
  organizationId,
  range,
  basePath,
}: {
  organizationId: string;
  range: DateRange;
  basePath: string;
}) {
  const [speciesResult, frequentResult] = await Promise.all([
    getPatientSpeciesBreakdown(organizationId, range),
    getFrequentPatients(organizationId, range, 10),
  ]);

  return (
    <div className="grid gap-6">
      <DateRangeFilter action={basePath} range={range} />

      {speciesResult.status === "error" || frequentResult.status === "error" ? (
        <Card>
          <CardContent>
            <ErrorState title="Patient reports could not be loaded" />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New patients, by species</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportBarChart data={groupBySpeciesBucket(speciesResult.data)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Most frequently visited patients</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportTable
                columns={["Patient", "Visits"]}
                rows={frequentResult.data.map((row) => [row.petName, row.visitCount])}
                emptyMessage="No visits in this range."
              />
            </CardContent>
          </Card>
        </>
      )}

      <ExportButtons exportBasePath={`${basePath}/export`} range={range} />
    </div>
  );
}
