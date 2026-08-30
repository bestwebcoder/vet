import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { NavMenuTreeEditor } from "@/components/nav-menu/nav-menu-tree-editor";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listNavMenuTreeForAdmin } from "@/features/nav-menu/queries";
import { listSitePagesForAdmin } from "@/features/site-pages/queries";

export const metadata: Metadata = { title: "Navigation · TV Care" };

const FIXED_PAGE_LINKS = [
  { value: "/", label: "Home" },
  { value: "/about", label: "About Us" },
  { value: "/services", label: "Services" },
  { value: "/training-education", label: "Training & Education" },
  { value: "/doctors", label: "Doctors" },
  { value: "/contact", label: "Contact Us" },
];

export default async function AdminNavigationPage() {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return (
      <div className="grid gap-6">
        <h1>Navigation</h1>
        <p className="text-muted-foreground">Your account is not linked to a practice yet.</p>
      </div>
    );
  }

  const [tree, sitePages] = await Promise.all([
    listNavMenuTreeForAdmin(organizationId),
    listSitePagesForAdmin(organizationId),
  ]);

  const customPageLinks =
    sitePages.status === "ok"
      ? sitePages.data.filter((page) => page.isPublished).map((page) => ({ value: `/${page.slug}`, label: page.title }))
      : [];
  const hrefSuggestions = [...FIXED_PAGE_LINKS, ...customPageLinks];

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/admin/website" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" aria-hidden />
          Website
        </Link>
        <h1>Navigation</h1>
        <p className="text-muted-foreground">
          What shows in the header, mobile menu and footer of the public site. Drag an item onto another to put it
          in that item&rsquo;s dropdown, or drag it back out to move it to the top level.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Menu items</CardTitle>
          <CardDescription>Up to one level of dropdown per item.</CardDescription>
        </CardHeader>
        <CardContent>
          {tree.status === "error" ? (
            <ErrorState title="The menu could not be loaded" />
          ) : tree.data.length === 0 ? (
            <EmptyState
              title="No menu items yet"
              description="Add your first item below — visitors won't see a header menu until you do."
            />
          ) : null}
          {tree.status === "ok" ? <NavMenuTreeEditor items={tree.data} hrefSuggestions={hrefSuggestions} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
