import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import type { PrescriptionDetail } from "@/features/prescriptions/queries";

/**
 * The finalized prescription PDF, §5.2/§5.5. A pure function of already-
 * fetched data plus one Supabase client used only to resolve the
 * organization's details and the doctor's signature image — no other side
 * effects, so it is trivially safe to call once, at finalize time, and never
 * again (see `savePrescriptionAction`).
 *
 * No actual clinic logo file exists anywhere in this codebase (the app itself
 * only ever uses a text wordmark, "TV Care"), so the header renders the
 * clinic name as a styled wordmark rather than inventing an image asset.
 */

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#26261a" },
  wordmark: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#3a5a40", letterSpacing: 1 },
  subtitle: { fontSize: 10, color: "#5c5c50", marginTop: 2 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 2 },
  clinicMeta: { fontSize: 8, color: "#5c5c50", marginTop: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#d8d8c8", marginVertical: 10 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  metaCol: { width: "50%", marginBottom: 6 },
  metaLabel: { fontSize: 8, color: "#5c5c50" },
  metaValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  table: { borderTopWidth: 1, borderTopColor: "#d8d8c8" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eeeee0", paddingVertical: 6 },
  tableHeaderRow: { flexDirection: "row", paddingVertical: 4, backgroundColor: "#f2f2e8" },
  colDrug: { width: "26%", paddingRight: 4 },
  colDose: { width: "16%", paddingRight: 4 },
  colRoute: { width: "12%", paddingRight: 4 },
  colFreq: { width: "14%", paddingRight: 4 },
  colDuration: { width: "14%", paddingRight: 4 },
  colQty: { width: "18%" },
  itemInstructions: { fontSize: 8, color: "#5c5c50", marginTop: 2 },
  headCell: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#5c5c50" },
  footerGrid: { flexDirection: "row", justifyContent: "space-between", marginTop: 28 },
  signatureBox: { width: "45%" },
  signatureImage: { width: 140, height: 50, objectFit: "contain", marginBottom: 4 },
  signatureTyped: { fontSize: 16, marginBottom: 4, color: "#26261a" },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#26261a", width: 160, paddingTop: 4 },
  small: { fontSize: 8, color: "#5c5c50" },
  idBadge: { fontSize: 8, color: "#5c5c50", marginTop: 4 },
});

type OrganizationInfo = { name: string; address: string | null; phone: string | null; email: string | null };

async function fetchOrganization(
  supabase: { from: (table: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any -- narrow Supabase client subset, avoids importing the full generated client type here
  organizationId: string,
): Promise<OrganizationInfo> {
  const { data } = await supabase
    .from("organizations")
    .select("name, address, phone, email")
    .eq("id", organizationId)
    .single();

  return data ?? { name: "The Traveling Vet", address: null, phone: null, email: null };
}

async function fetchSignatureDataUri(
  supabase: { storage: { from: (bucket: string) => any } }, // eslint-disable-line @typescript-eslint/no-explicit-any -- same narrow subset as above
  path: string | null,
): Promise<string | null> {
  if (!path) return null;

  const { data, error } = await supabase.storage.from("doctor-signatures").download(path);
  if (error || !data) return null;

  const buffer = Buffer.from(await data.arrayBuffer());
  const mime = data.type || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see fetchOrganization
export async function renderPrescriptionPdf(prescription: PrescriptionDetail, supabase: any): Promise<Buffer> {
  const [organization, signatureDataUri] = await Promise.all([
    fetchOrganization(supabase, prescription.organizationId),
    fetchSignatureDataUri(supabase, prescription.doctorSignaturePath),
  ]);

  const doc = (
    <Document title={`Prescription ${prescription.prescriptionNumber}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.wordmark}>{organization.name.toUpperCase()}</Text>
        <Text style={styles.subtitle}>Veterinary Care</Text>
        <Text style={styles.title}>Prescription</Text>
        <Text style={styles.clinicMeta}>
          {[organization.address, organization.phone, organization.email].filter(Boolean).join("  ·  ")}
        </Text>

        <View style={styles.divider} />

        <View style={styles.metaGrid}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Doctor</Text>
            <Text style={styles.metaValue}>Dr. {prescription.doctorName}</Text>
            {prescription.doctorRegistrationNumber ? (
              <Text style={styles.small}>Reg. No. {prescription.doctorRegistrationNumber}</Text>
            ) : null}
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{formatDate(prescription.finalizedAt ?? prescription.createdAt)}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Patient</Text>
            <Text style={styles.metaValue}>{prescription.petName}</Text>
            <Text style={styles.small}>
              {[prescription.speciesName, prescription.breedName].filter(Boolean).join(" · ") || "Species not recorded"}
            </Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Owner</Text>
            <Text style={styles.metaValue}>{prescription.clientName}</Text>
            <Text style={styles.small}>{prescription.clientPhone}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Prescription</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.headCell, styles.colDrug]}>Drug</Text>
            <Text style={[styles.headCell, styles.colDose]}>Dose</Text>
            <Text style={[styles.headCell, styles.colRoute]}>Route</Text>
            <Text style={[styles.headCell, styles.colFreq]}>Frequency</Text>
            <Text style={[styles.headCell, styles.colDuration]}>Duration</Text>
            <Text style={[styles.headCell, styles.colQty]}>Quantity</Text>
          </View>
          {prescription.items.map((item) => (
            <View style={styles.tableRow} key={item.id} wrap={false}>
              <View style={styles.colDrug}>
                <Text>{item.drugName}</Text>
                {item.strength || item.formulation ? (
                  <Text style={styles.small}>{[item.strength, item.formulation].filter(Boolean).join(" · ")}</Text>
                ) : null}
              </View>
              <Text style={styles.colDose}>
                {item.computedDose != null
                  ? `${item.computedDose}${item.doseUnit ?? ""}`
                  : item.dosePerKg != null
                    ? `${item.dosePerKg}${item.doseUnit ?? ""}/kg`
                    : "—"}
              </Text>
              <Text style={styles.colRoute}>{item.route ?? "—"}</Text>
              <Text style={styles.colFreq}>{item.frequency ?? "—"}</Text>
              <Text style={styles.colDuration}>{item.duration ?? "—"}</Text>
              <View style={styles.colQty}>
                <Text>{item.quantity ?? "—"}</Text>
                {item.instructions ? <Text style={styles.itemInstructions}>{item.instructions}</Text> : null}
              </View>
            </View>
          ))}
        </View>

        {prescription.instructions ? (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <Text>{prescription.instructions}</Text>
          </View>
        ) : null}

        <View style={styles.metaGrid}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Follow-up date</Text>
            <Text style={styles.metaValue}>{prescription.followUpDate ? formatDate(prescription.followUpDate) : "Not scheduled"}</Text>
          </View>
        </View>

        <View style={styles.footerGrid} wrap={false}>
          <View style={styles.signatureBox}>
            {signatureDataUri ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image has no alt prop
              <Image src={signatureDataUri} style={styles.signatureImage} />
            ) : (
              <Text style={styles.signatureTyped}>{prescription.doctorName}</Text>
            )}
            <View style={styles.signatureLine}>
              <Text style={styles.small}>Dr. {prescription.doctorName}</Text>
              <Text style={styles.small}>
                Digitally signed {prescription.signedAt ? formatDate(prescription.signedAt) : formatDate(prescription.finalizedAt)}
              </Text>
            </View>
          </View>
          <View>
            <Text style={styles.idBadge}>Prescription ID: {prescription.prescriptionNumber}</Text>
            {prescription.version > 1 ? <Text style={styles.idBadge}>Version {prescription.version}</Text> : null}
          </View>
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
