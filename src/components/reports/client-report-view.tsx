import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ExportButtons } from "@/components/reports/export-buttons";
import { ReportBarChart } from "@/components/reports/report-bar-chart";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientSummary } from "@/features/reports/queries";
import type { DateRange } from "@/lib/validation/date-range";

/** §8.3 — shared between `/admin/reports/clients` and `/doctor/reports/clients`. */
export async function ClientReportView({
  organizationId,
  range,
  basePath,
}: {
  organizationId: string;
  range: DateRange;
  basePath: string;
}) {
  const summaryResult = await getClientSummary(organizationId, range);

  return (
    <div className="grid gap-6">
      <DateRangeFilter action={basePath} range={range} />

      {summaryResult.status === "error" ? (
        <Card>
          <CardContent>
            <ErrorState title="Client reports could not be loaded" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clients, by status</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportBarChart
              data={[
                { label: "New", value: summaryResult.data.newClients },
                { label: "Returning", value: summaryResult.data.returningClients },
                { label: "Active", value: summaryResult.data.activeClients },
              ]}
            />
          </CardContent>
        </Card>
      )}

      <ExportButtons exportBasePath={`${basePath}/export`} range={range} />
    </div>
  );
}
