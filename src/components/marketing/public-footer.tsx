import Link from "next/link";

import { WhatsAppButton } from "@/components/marketing/whatsapp-button";
import { getPublicNavTree } from "@/features/nav-menu/queries";
import type { PublicOrganizationInfo } from "@/features/organizations/queries";
import { siteContentValue } from "@/features/site-content/fields";
import { getPublicSiteContent } from "@/features/site-content/queries";

export async function PublicFooter({ organization }: { organization: PublicOrganizationInfo | null }) {
  const practiceName = organization?.name ?? "The Traveling Vet";

  // A footer link list is meant to be scannable, not a full site map — only
  // the top-level items, dropdowns flattened away. Fetched here rather than
  // threaded through as a prop, same as the nav tree — every caller already
  // has `organization` in scope, nothing else to pass down.
  const [navItems, content] = await Promise.all([
    organization ? getPublicNavTree(organization.id) : Promise.resolve([]),
    organization ? getPublicSiteContent(organization.id) : Promise.resolve({}),
  ]);

  const tagline = siteContentValue(content, "footer.tagline", practiceName);
  const copyright = siteContentValue(content, "footer.copyright_override", practiceName);
  const showLogo = organization?.footerShowLogo ?? true;

  return (
    <>
      <footer className="border-border/60 border-t">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6">
          <div className="text-muted-foreground grid gap-3 text-sm">
            <div className="flex items-center gap-2.5">
              {showLogo ? (
                organization?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, arbitrary dimensions; no build-time optimization to gain here.
                  <img src={organization.logoUrl} alt="" className="size-8 shrink-0 rounded-lg object-contain" />
                ) : (
                  <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold">
                    TV
                  </span>
                )
              ) : null}
              <p className="text-foreground font-medium">{practiceName}</p>
            </div>
            {tagline ? <p>{tagline}</p> : null}
            {organization?.address || organization?.city ? (
              <p>{[organization.address, organization.city].filter(Boolean).join(", ")}</p>
            ) : null}
            <p className="flex flex-wrap gap-x-4">
              {organization?.phone ? <span>{organization.phone}</span> : null}
              {organization?.email ? <span>{organization.email}</span> : null}
            </p>
            <p>{copyright}</p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 sm:justify-end" aria-label="Footer">
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                target={item.opensNewTab ? "_blank" : undefined}
                rel={item.opensNewTab ? "noopener noreferrer" : undefined}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>

      <WhatsAppButton whatsappNumber={organization?.whatsappNumber ?? null} />
    </>
  );
}
