import { notFound } from "next/navigation";

import { ComingSoon } from "@/components/shell/coming-soon";
import { findNavItem } from "@/components/shell/navigation";

/**
 * Catch-all for navigation items a later phase delivers. A path that is not a
 * known navigation item is a genuine 404 — this must not turn every typo into
 * a friendly page. Once a screen is built, its own route file takes precedence
 * over this one.
 */
export default async function ComingSoonPage({ params }: PageProps<"/doctor/[...slug]">) {
  const { slug } = await params;
  const item = findNavItem("doctor", `/doctor/${slug.join("/")}`);

  if (!item) {
    notFound();
  }

  return <ComingSoon item={item} />;
}
