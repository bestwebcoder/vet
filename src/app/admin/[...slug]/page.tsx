import { notFound } from "next/navigation";

import { ComingSoon } from "@/components/shell/coming-soon";
import { findNavItem } from "@/components/shell/navigation";
import { ADMIN_ONLY } from "@/features/auth/access";
import { requireRole } from "@/features/auth/session";

/**
 * Catch-all for navigation items a later phase delivers. A path that is not a
 * known navigation item is a genuine 404 — this must not turn every typo into
 * a friendly page. Once a screen is built, its own route file takes precedence
 * over this one.
 *
 * Guards on the item's own roles rather than leaning on the area layout: that
 * layout now admits the narrower clinic-side roles too, so without this a
 * receptionist would be shown the name and description of every unbuilt
 * administrator-only screen.
 */
export default async function ComingSoonPage({ params }: PageProps<"/admin/[...slug]">) {
  const { slug } = await params;
  const item = findNavItem("admin", `/admin/${slug.join("/")}`);

  if (!item) {
    notFound();
  }

  await requireRole(...(item.roles ?? ADMIN_ONLY));

  return <ComingSoon item={item} />;
}
