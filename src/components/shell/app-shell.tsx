import { Search, UserRound } from "lucide-react";
import Link from "next/link";

import { MobileNav } from "@/components/shell/mobile-nav";
import { NavLinks } from "@/components/shell/nav-links";
import type { Area } from "@/components/shell/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";
import type { SessionUser } from "@/features/auth/session";

/**
 * The application frame: a persistent sidebar from `lg` up, a header with a
 * drawer below it. Content is the same list in both, from one definition.
 */
export function AppShell({
  area,
  user,
  children,
}: {
  area: Area;
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/40 min-h-svh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="bg-sidebar text-sidebar-foreground hidden border-r lg:flex lg:h-svh lg:flex-col lg:sticky lg:top-0">
        <div className="border-b px-5 py-4">
          <Link href={area.href} className="grid">
            <span className="text-base font-semibold tracking-tight">TV Care</span>
            <span className="text-muted-foreground text-xs">{area.label}</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks areaKey={area.key} roles={user.roles} permissions={user.customPermissions} />
        </div>
        <div className="border-t p-3">
          {area.key !== "client" ? (
            <Link
              href={`${area.href}/search`}
              className={buttonVariants({ variant: "outline", size: "sm", className: "mb-3 w-full" })}
            >
              <Search aria-hidden />
              Search
            </Link>
          ) : null}
          <UserPanel user={user} profileHref={`${area.href}/profile`} />
        </div>
      </aside>

      <div className="flex min-h-svh flex-col">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-2 py-2 backdrop-blur lg:hidden">
          <MobileNav areaKey={area.key} roles={user.roles} permissions={user.customPermissions} />
          <Link href={area.href} className="grid leading-tight">
            <span className="text-sm font-semibold tracking-tight">TV Care</span>
            <span className="text-muted-foreground text-xs">{area.label}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1 pr-1">
            {area.key !== "client" ? (
              <Link
                href={`${area.href}/search`}
                className={buttonVariants({ variant: "ghost", size: "icon" })}
                aria-label="Search"
              >
                <Search aria-hidden />
              </Link>
            ) : null}
            <Link
              href={`${area.href}/profile`}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
              aria-label="My profile"
            >
              <UserRound aria-hidden />
            </Link>
            <ThemeToggle />
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function UserPanel({ user, profileHref }: { user: SessionUser; profileHref: string }) {
  return (
    <div className="grid gap-2">
      <Link href={profileHref} className="hover:bg-sidebar-accent flex items-center gap-2 rounded-md px-2 py-1">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- an arbitrary-dimension public image; no build-time optimization to gain here.
          <img src={user.avatarUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="bg-secondary text-secondary-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
            <UserRound className="size-4" aria-hidden />
          </span>
        )}
        <span className="grid min-w-0 leading-tight">
          <span className="truncate text-sm font-medium">{user.fullName}</span>
          <span className="text-muted-foreground truncate text-xs">{user.email}</span>
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <form action={logoutAction} className="flex-1">
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Sign out
          </Button>
        </form>
        <ThemeToggle />
      </div>
    </div>
  );
}
