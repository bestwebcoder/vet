import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";

import { formatCurrency } from "@/lib/currency";

/**
 * The issued invoice PDF, §7.5. A pure function of already-fetched data
 * plus one Supabase client used only to resolve the organization's details
 * — no other side effects, so it is safe to call once, at issue time (see
 * `issueInvoiceAction`), and never again.
 *
 * Same wordmark-not-image-file header as `src/lib/prescription-pdf.tsx`:
 * no logo asset exists anywhere in this codebase, so the clinic name is a
 * styled wordmark rather than an invented image.
 */

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#26261a" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  wordmark: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#3a5a40", letterSpacing: 1 },
  subtitle: { fontSize: 10, color: "#5c5c50", marginTop: 2 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 2 },
  clinicMeta: { fontSize: 8, color: "#5c5c50", marginTop: 8 },
  qrImage: { width: 64, height: 64 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#d8d8c8", marginVertical: 10 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  metaCol: { width: "50%", marginBottom: 6 },
  metaLabel: { fontSize: 8, color: "#5c5c50" },
  metaValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  statusBadge: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#3a5a40" },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  table: { borderTopWidth: 1, borderTopColor: "#d8d8c8" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eeeee0", paddingVertical: 6 },
  tableHeaderRow: { flexDirection: "row", paddingVertical: 4, backgroundColor: "#f2f2e8" },
  colDescription: { width: "46%", paddingRight: 4 },
  colQty: { width: "12%", textAlign: "right" },
  colUnitPrice: { width: "18%", textAlign: "right" },
  colTax: { width: "10%", textAlign: "right" },
  colLineTotal: { width: "14%", textAlign: "right" },
  headCell: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#5c5c50" },
  totalsBlock: { alignSelf: "flex-end", width: "45%", marginTop: 12 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalsLabel: { color: "#5c5c50" },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#26261a",
    marginTop: 4,
    paddingTop: 4,
  },
  grandTotalLabel: { fontFamily: "Helvetica-Bold" },
  grandTotalValue: { fontFamily: "Helvetica-Bold" },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, marginTop: 6 },
  balanceLabel: { fontFamily: "Helvetica-Bold", color: "#8a3b2b" },
  balanceValue: { fontFamily: "Helvetica-Bold", color: "#8a3b2b" },
  footerGrid: { flexDirection: "row", justifyContent: "space-between", marginTop: 28 },
  small: { fontSize: 8, color: "#5c5c50" },
  paymentBox: { width: "55%" },
  idBadge: { fontSize: 8, color: "#5c5c50", marginTop: 4 },
});

type OrganizationInfo = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  payment_instructions: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Partially paid",
  paid: "Paid",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

async function fetchOrganization(
  supabase: { from: (table: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any -- narrow Supabase client subset, avoids importing the full generated client type here
  organizationId: string,
): Promise<OrganizationInfo> {
  const { data } = await supabase
    .from("organizations")
    .select("name, address, phone, email, payment_instructions")
    .eq("id", organizationId)
    .single();

  return data ?? { name: "The Traveling Vet", address: null, phone: null, email: null, payment_instructions: null };
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export type InvoicePdfInput = {
  id: string;
  invoice_number: string;
  status: string;
  client_id: string;
  pet_id: string | null;
  subtotal_paisa: number;
  discount_paisa: number;
  tax_paisa: number;
  total_paisa: number;
  amount_paid_paisa: number;
  balance_paisa: number;
  issued_at: string | null;
  due_date: string | null;
  organization_id: string;
  client: { full_name: string; phone: string; address: string | null } | { full_name: string; phone: string; address: string | null }[] | null;
  pet: { name: string } | { name: string }[] | null;
  items: {
    description: string;
    quantity: number;
    unit_price_paisa: number;
    tax_rate_percent: number;
    line_total_paisa: number;
    sort_order: number;
  }[];
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see fetchOrganization
export async function renderInvoicePdf(invoice: InvoicePdfInput, supabase: any): Promise<Buffer> {
  const organization = await fetchOrganization(supabase, invoice.organization_id);
  const client = one(invoice.client);
  const pet = one(invoice.pet);

  const qrDataUri = await QRCode.toDataURL(
    `${invoice.invoice_number} · ${formatCurrency(invoice.total_paisa)}`,
    { margin: 1, width: 200 },
  );

  const sortedItems = [...invoice.items].sort((a, b) => a.sort_order - b.sort_order);

  const doc = (
    <Document title={`Invoice ${invoice.invoice_number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.wordmark}>{organization.name.toUpperCase()}</Text>
            <Text style={styles.subtitle}>Veterinary Care</Text>
            <Text style={styles.title}>Invoice</Text>
            <Text style={styles.clinicMeta}>
              {[organization.address, organization.phone, organization.email].filter(Boolean).join("  ·  ")}
            </Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image has no alt prop */}
          <Image src={qrDataUri} style={styles.qrImage} />
        </View>

        <View style={styles.divider} />

        <View style={styles.metaGrid}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Invoice number</Text>
            <Text style={styles.metaValue}>{invoice.invoice_number}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={styles.statusBadge}>{STATUS_LABEL[invoice.status] ?? invoice.status}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Date issued</Text>
            <Text style={styles.metaValue}>{formatDate(invoice.issued_at)}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Due date</Text>
            <Text style={styles.metaValue}>{formatDate(invoice.due_date)}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Client</Text>
            <Text style={styles.metaValue}>{client?.full_name ?? "Unknown client"}</Text>
            <Text style={styles.small}>{client?.phone ?? ""}</Text>
          </View>
          {pet ? (
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Patient</Text>
              <Text style={styles.metaValue}>{pet.name}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Items</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.headCell, styles.colDescription]}>Description</Text>
            <Text style={[styles.headCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.headCell, styles.colUnitPrice]}>Unit price</Text>
            <Text style={[styles.headCell, styles.colTax]}>Tax</Text>
            <Text style={[styles.headCell, styles.colLineTotal]}>Total</Text>
          </View>
          {sortedItems.map((item, index) => (
            <View style={styles.tableRow} key={index} wrap={false}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colUnitPrice}>{formatCurrency(item.unit_price_paisa)}</Text>
              <Text style={styles.colTax}>{item.tax_rate_percent}%</Text>
              <Text style={styles.colLineTotal}>{formatCurrency(item.line_total_paisa)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text>{formatCurrency(invoice.subtotal_paisa)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Discount</Text>
            <Text>−{formatCurrency(invoice.discount_paisa)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text>{formatCurrency(invoice.tax_paisa)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(invoice.total_paisa)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Amount paid</Text>
            <Text>{formatCurrency(invoice.amount_paid_paisa)}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Balance due</Text>
            <Text style={styles.balanceValue}>{formatCurrency(invoice.balance_paisa)}</Text>
          </View>
        </View>

        <View style={styles.footerGrid} wrap={false}>
          <View style={styles.paymentBox}>
            <Text style={styles.sectionTitle}>Payment information</Text>
            <Text style={styles.small}>
              {organization.payment_instructions ?? `Please contact ${organization.phone ?? organization.name} to arrange payment.`}
            </Text>
          </View>
          <View>
            <Text style={styles.idBadge}>Invoice ID: {invoice.invoice_number}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
