import { ACCESS } from "@/features/auth/access";
import { requireRole } from "@/features/auth/session";

/**
 * Diagnostic tests and their results.
 *
 * The guard lives here rather than on each page so it runs *above* this
 * group's loading boundary. A redirect thrown inside a streamed segment is
 * delivered in the payload with an HTTP 200; thrown from a layout above the
 * boundary it stays a 307, which is what an unauthorized request should
 * answer. Ordering a test stays a clinical decision and is refused in the database, whatever this area shows.
 *
 * Route groups do not appear in the URL — these pages are still /admin/....
 */
export default async function AccessLayout({ children }: { children: React.ReactNode }) {
  await requireRole(...ACCESS.lab);

  return children;
}
