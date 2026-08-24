import Link from "next/link";

import { PUBLIC_NAV_LINKS } from "@/components/marketing/nav-links";
import { PublicMobileNav } from "@/components/marketing/public-mobile-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

export function PublicHeader({ practiceName }: { practiceName: string }) {
  return (
    <header className="border-border/60 bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold">
            TV
          </span>
          <span>
            <p className="text-lg leading-tight font-semibold tracking-tight">TV Care</p>
            <p className="text-muted-foreground text-xs leading-tight">{practiceName}</p>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Main">
          {PUBLIC_NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-foreground text-sm font-medium">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle size="icon-lg" />
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "touch" })}>
            Sign in
          </Link>
          <Link href="/register" className={buttonVariants({ size: "touch" })}>
            Get started
          </Link>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle size="icon-lg" />
          <PublicMobileNav />
        </div>
      </div>
    </header>
  );
}
