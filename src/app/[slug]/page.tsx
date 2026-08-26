import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { SitePageBlocks } from "@/components/marketing/site-page-blocks";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";
import { getPublicSitePage } from "@/features/site-pages/queries";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const organization = await getPublicOrganizationInfo();
  if (!organization) return {};

  const page = await getPublicSitePage(organization.id, slug);
  return { title: page ? `${page.title} · TV Care` : "Page not found" };
}

export default async function CustomSitePage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const organization = await getPublicOrganizationInfo();
  if (!organization) notFound();

  const page = await getPublicSitePage(organization.id, slug);
  if (!page) notFound();

  const practiceName = organization.name;

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader practiceName={practiceName} logoUrl={organization.logoUrl} organizationId={organization.id} />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 pt-16 text-center sm:px-6">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{page.title}</h1>
        </div>
        <SitePageBlocks blocks={page.blocks} />
      </main>

      <PublicFooter organization={organization} />
    </div>
  );
}
