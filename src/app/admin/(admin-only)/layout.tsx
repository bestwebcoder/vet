import { ADMIN_ONLY } from "@/features/auth/access";
import { requireRole } from "@/features/auth/session";

/**
 * The practice's own administration: clients, patients, users, settings, the
 * website, and the clinical/client/patient reports.
 *
 * The guard lives here rather than on each page so it runs *above* this
 * group's loading boundary. A redirect thrown inside a streamed segment is
 * delivered in the payload with an HTTP 200; thrown from a layout above the
 * boundary it stays a 307, which is what an unauthorized request should
 * answer.
 *
 * This is also the one guard the /admin layout cannot make: that layout admits
 * the three narrower clinic-side roles, so without this every one of them
 * would reach the pages below.
 *
 * Route groups do not appear in the URL — these pages are still /admin/....
 */
export default async function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireRole(...ADMIN_ONLY);

  return children;
}
