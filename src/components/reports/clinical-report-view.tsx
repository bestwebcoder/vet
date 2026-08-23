import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ExportButtons } from "@/components/reports/export-buttons";
import { ReportBarChart } from "@/components/reports/report-bar-chart";
import { ReportTable } from "@/components/reports/report-table";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getClinicalSummary, getCommonDiagnoses } from "@/features/reports/queries";
import type { DateRange } from "@/lib/validation/date-range";

/** §8.2 — shared between `/admin/reports/clinical` and `/doctor/reports/clinical`. */
export async function ClinicalReportView({
  organizationId,
  range,
  basePath,
}: {
  organizationId: string;
  range: DateRange;
  basePath: string;
}) {
  const [summaryResult, diagnosesResult] = await Promise.all([
    getClinicalSummary(organizationId, range),
    getCommonDiagnoses(organizationId, range, 10),
  ]);

  return (
    <div className="grid gap-6">
      <DateRangeFilter action={basePath} range={range} />

      {summaryResult.status === "error" || diagnosesResult.status === "error" ? (
        <Card>
          <CardContent>
            <ErrorState title="Clinical reports could not be loaded" />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visits, by type</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportBarChart
                data={[
                  { label: "Consultations", value: summaryResult.data.consultations },
                  { label: "Follow-ups", value: summaryResult.data.followUps },
                  { label: "Emergencies", value: summaryResult.data.emergencies },
                  { label: "Vaccinations", value: summaryResult.data.vaccinations },
                  { label: "Deworming", value: summaryResult.data.dewormings },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Most common diagnoses</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportTable
                columns={["Diagnosis", "Occurrences"]}
                rows={diagnosesResult.data.map((row) => [row.description, row.occurrences])}
                emptyMessage="No diagnoses recorded in this range."
              />
            </CardContent>
          </Card>
        </>
      )}

      <ExportButtons exportBasePath={`${basePath}/export`} range={range} />
    </div>
  );
}
