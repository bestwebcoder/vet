import { ACCESS } from "@/features/auth/access";
import { requireRole } from "@/features/auth/session";

/**
 * Invoices, payments, transactions and the financial reports.
 *
 * The guard lives here rather than on each page so it runs *above* this
 * group's loading boundary. A redirect thrown inside a streamed segment is
 * delivered in the payload with an HTTP 200; thrown from a layout above the
 * boundary it stays a 307, which is what an unauthorized request should
 * answer. The clinical, client and patient reports are deliberately not here — they sit under (admin-only), so a finance manager reaching them is still refused with a 307.
 *
 * Route groups do not appear in the URL — these pages are still /admin/....
 */
export default async function AccessLayout({ children }: { children: React.ReactNode }) {
  await requireRole(...ACCESS.finance);

  return children;
}
