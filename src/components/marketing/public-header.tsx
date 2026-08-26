import Link from "next/link";

import { NavDropdown } from "@/components/marketing/nav-dropdown";
import { PublicMobileNav } from "@/components/marketing/public-mobile-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { getSessionUser, homeHrefFor } from "@/features/auth/session";
import { getPublicNavTree } from "@/features/nav-menu/queries";

/**
 * Signed-in visitors browsing the public site (someone checking how the
 * home page looks, following a link from outside the app) get a Dashboard
 * link here instead of Sign in / Get started — those would just bounce them
 * to /login while already authenticated.
 */
export async function PublicHeader({
  practiceName,
  logoUrl = null,
  organizationId = null,
}: {
  practiceName: string;
  logoUrl?: string | null;
  organizationId?: string | null;
}) {
  const [user, navItems] = await Promise.all([
    getSessionUser(),
    organizationId ? getPublicNavTree(organizationId) : Promise.resolve([]),
  ]);
  const homeHref = user ? homeHrefFor(user) : null;

  return (
    <header className="border-border/60 bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, arbitrary dimensions; no build-time optimization to gain here.
            <img src={logoUrl} alt="" className="size-9 shrink-0 rounded-xl object-contain" />
          ) : (
            <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold">
              TV
            </span>
          )}
          <span>
            <p className="text-lg leading-tight font-semibold tracking-tight">TV Care</p>
            <p className="text-muted-foreground text-xs leading-tight">{practiceName}</p>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Main">
          {navItems.map((item) =>
            item.children.length > 0 ? (
              <NavDropdown key={item.id} item={item} />
            ) : (
              <Link
                key={item.id}
                href={item.href}
                target={item.opensNewTab ? "_blank" : undefined}
                rel={item.opensNewTab ? "noopener noreferrer" : undefined}
                className="hover:text-foreground text-sm font-medium"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle size="icon-lg" />
          {homeHref ? (
            <Link href={homeHref} className={buttonVariants({ size: "touch" })}>
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost", size: "touch" })}>
                Sign in
              </Link>
              <Link href="/register" className={buttonVariants({ size: "touch" })}>
                Get started
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle size="icon-lg" />
          <PublicMobileNav homeHref={homeHref} navItems={navItems} />
        </div>
      </div>
    </header>
  );
}
