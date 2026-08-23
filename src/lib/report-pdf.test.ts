import { describe, expect, it } from "vitest";

import { renderReportPdf } from "@/lib/report-pdf";

const SECTIONS = [
  { title: "Revenue by service", columns: ["Service", "Revenue"], rows: [["Consultation", "৳1,000.00"]] },
  { title: "Outstanding invoices", columns: ["Invoice", "Balance"], rows: [] },
];

/** A stub Supabase client: no organization row on file — exercises the fallback path. */
const stubSupabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null }),
      }),
    }),
  }),
};

describe("renderReportPdf", () => {
  it("produces a real PDF with sections, including an empty one", async () => {
    const buffer = await renderReportPdf(
      "Financial report",
      { from: "2026-01-01", to: "2026-01-31" },
      "44444444-4444-4444-4444-444444444444",
      SECTIONS,
      stubSupabase,
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
