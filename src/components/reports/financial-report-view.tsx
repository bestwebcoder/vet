import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ExportButtons } from "@/components/reports/export-buttons";
import { ReportBarChart } from "@/components/reports/report-bar-chart";
import { ReportTable } from "@/components/reports/report-table";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRevenueByDoctor, getRevenueByService, getRevenueSeries, getRevenueTotals } from "@/features/reports/queries";
import { formatCurrency } from "@/lib/currency";
import type { DateRange } from "@/lib/validation/date-range";

/** §8.1 — shared between `/admin/reports/financial` and `/doctor/reports/financial`. */
export async function FinancialReportView({
  organizationId,
  range,
  basePath,
}: {
  organizationId: string;
  range: DateRange;
  basePath: string;
}) {
  const [seriesResult, totalsResult, byServiceResult, byDoctorResult] = await Promise.all([
    getRevenueSeries(organizationId, range, "day"),
    getRevenueTotals(organizationId, range),
    getRevenueByService(organizationId, range),
    getRevenueByDoctor(organizationId, range),
  ]);

  return (
    <div className="grid gap-6">
      <DateRangeFilter action={basePath} range={range} />

      {seriesResult.status === "error" ||
      totalsResult.status === "error" ||
      byServiceResult.status === "error" ||
      byDoctorResult.status === "error" ? (
        <Card>
          <CardContent>
            <ErrorState title="Financial reports could not be loaded" />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue collected, by day</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportBarChart
                data={seriesResult.data.map((point) => ({ label: point.periodStart, value: point.revenuePaisa }))}
                format="currency"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outstanding vs. paid invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportTable
                columns={["", "Invoices", "Amount"]}
                rows={[
                  ["Outstanding", totalsResult.data.outstandingCount, formatCurrency(totalsResult.data.outstandingPaisa)],
                  ["Paid", totalsResult.data.paidCount, formatCurrency(totalsResult.data.paidPaisa)],
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue by service</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportTable
                columns={["Service", "Quantity", "Revenue"]}
                rows={byServiceResult.data.map((row) => [row.serviceName, row.quantity, formatCurrency(row.revenuePaisa)])}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue by doctor</CardTitle>
            </CardHeader>
            <CardContent>
              <ReportTable
                columns={["Doctor", "Revenue"]}
                rows={byDoctorResult.data.map((row) => [row.doctorName, formatCurrency(row.revenuePaisa)])}
              />
            </CardContent>
          </Card>
        </>
      )}

      <ExportButtons exportBasePath={`${basePath}/export`} range={range} />
    </div>
  );
}
