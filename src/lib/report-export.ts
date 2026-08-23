import { createClient } from "@/lib/supabase/server";
import { toCsv, type CsvSection } from "@/lib/csv";
import { renderReportPdf } from "@/lib/report-pdf";

/**
 * Shared response-building for every report's export route (§8.5). Each
 * route fetches its own data and builds the same `CsvSection[]` shape used
 * for the on-screen tables, then hands it here for the actual file.
 */
export async function reportExportResponse(
  format: string | null,
  title: string,
  slug: string,
  range: { from: string; to: string },
  organizationId: string,
  sections: CsvSection[],
): Promise<Response> {
  if (format === "pdf") {
    const supabase = await createClient();
    const buffer = await renderReportPdf(title, range, organizationId, sections, supabase);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slug}-${range.from}-to-${range.to}.pdf"`,
      },
    });
  }

  const csv = toCsv(sections);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-${range.from}-to-${range.to}.csv"`,
    },
  });
}
