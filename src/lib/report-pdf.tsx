import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import type { CsvSection } from "@/lib/csv";

/**
 * A report PDF — one or more labelled tables on one document. Same
 * wordmark-not-image-file header as `src/lib/invoice-pdf.tsx`/
 * `src/lib/prescription-pdf.tsx`: no logo asset exists in this codebase, so
 * the clinic name is a styled wordmark. Generated fresh on every export
 * request, never stored — unlike an invoice PDF, a report has no fixed,
 * final version to keep.
 */

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#26261a" },
  wordmark: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#3a5a40", letterSpacing: 1 },
  subtitle: { fontSize: 10, color: "#5c5c50", marginTop: 2 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 2 },
  rangeMeta: { fontSize: 9, color: "#5c5c50", marginBottom: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#d8d8c8", marginVertical: 10 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  table: { borderTopWidth: 1, borderTopColor: "#d8d8c8" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eeeee0", paddingVertical: 5 },
  tableHeaderRow: { flexDirection: "row", paddingVertical: 4, backgroundColor: "#f2f2e8" },
  cell: { flex: 1, paddingRight: 4 },
  headCell: { flex: 1, paddingRight: 4, fontSize: 8, fontFamily: "Helvetica-Bold", color: "#5c5c50" },
});

type OrganizationInfo = { name: string; address: string | null; phone: string | null; email: string | null };

async function fetchOrganization(
  supabase: { from: (table: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any -- narrow Supabase client subset, avoids importing the full generated client type here
  organizationId: string,
): Promise<OrganizationInfo> {
  const { data } = await supabase.from("organizations").select("name, address, phone, email").eq("id", organizationId).single();
  return data ?? { name: "The Traveling Vet", address: null, phone: null, email: null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see fetchOrganization
export async function renderReportPdf(title: string, range: { from: string; to: string }, organizationId: string, sections: CsvSection[], supabase: any): Promise<Buffer> {
  const organization = await fetchOrganization(supabase, organizationId);

  const doc = (
    <Document title={title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.wordmark}>{organization.name.toUpperCase()}</Text>
        <Text style={styles.subtitle}>Veterinary Care</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.rangeMeta}>
          {range.from} to {range.to}
        </Text>

        <View style={styles.divider} />

        {sections.map((section) => (
          <View key={section.title} wrap={false}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.rows.length === 0 ? (
              <Text style={{ color: "#5c5c50" }}>No data for this range.</Text>
            ) : (
              <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                  {section.columns.map((column) => (
                    <Text key={column} style={styles.headCell}>
                      {column}
                    </Text>
                  ))}
                </View>
                {section.rows.map((row, index) => (
                  <View style={styles.tableRow} key={index}>
                    {row.map((cell, cellIndex) => (
                      <Text key={cellIndex} style={styles.cell}>
                        {String(cell)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
