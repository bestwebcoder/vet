import type { Metadata } from "next";
import Link from "next/link";

import { SitePageForm } from "@/components/site-pages/site-page-form";
import { requireRole } from "@/features/auth/session";
import { createSitePageAction } from "@/features/site-pages/actions";

export const metadata: Metadata = { title: "New page · TV Care" };

export default async function NewSitePagePage() {
  await requireRole("admin", "super_admin");

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div className="grid gap-1">
        <h1>New page</h1>
        <p className="text-muted-foreground">
          <Link href="/admin/website" className="underline underline-offset-4">
            Back to Website
          </Link>
        </p>
      </div>

      <SitePageForm action={createSitePageAction} submitLabel="Create page" />
    </div>
  );
}
