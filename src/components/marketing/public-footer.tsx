import Link from "next/link";

import { PUBLIC_NAV_LINKS } from "@/components/marketing/nav-links";
import { WhatsAppButton } from "@/components/marketing/whatsapp-button";
import type { PublicOrganizationInfo } from "@/features/organizations/queries";

export function PublicFooter({ organization }: { organization: PublicOrganizationInfo | null }) {
  const practiceName = organization?.name ?? "The Traveling Vet";

  return (
    <>
      <footer className="border-border/60 border-t">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6">
          <div className="text-muted-foreground grid gap-3 text-sm">
            <div className="flex items-center gap-2.5">
              <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold">
                TV
              </span>
              <p className="text-foreground font-medium">{practiceName}</p>
            </div>
            {organization?.address || organization?.city ? (
              <p>{[organization.address, organization.city].filter(Boolean).join(", ")}</p>
            ) : null}
            <p className="flex flex-wrap gap-x-4">
              {organization?.phone ? <span>{organization.phone}</span> : null}
              {organization?.email ? <span>{organization.email}</span> : null}
            </p>
            <p>© {new Date().getFullYear()} TV Care.</p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 sm:justify-end" aria-label="Footer">
            {PUBLIC_NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground text-sm">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>

      <WhatsAppButton whatsappNumber={organization?.whatsappNumber ?? null} />
    </>
  );
}
