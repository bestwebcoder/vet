import Link from "next/link";

import { MobileNav } from "@/components/shell/mobile-nav";
import { NavLinks } from "@/components/shell/nav-links";
import type { Area } from "@/components/shell/navigation";
import { Button } from "@/components/ui/button";
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
          <NavLinks areaKey={area.key} />
        </div>
        <div className="border-t p-3">
          <UserPanel user={user} />
        </div>
      </aside>

      <div className="flex min-h-svh flex-col">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-2 py-2 backdrop-blur lg:hidden">
          <MobileNav areaKey={area.key} />
          <Link href={area.href} className="grid leading-tight">
            <span className="text-sm font-semibold tracking-tight">TV Care</span>
            <span className="text-muted-foreground text-xs">{area.label}</span>
          </Link>
          <div className="ml-auto pr-1">
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

function UserPanel({ user }: { user: SessionUser }) {
  return (
    <div className="grid gap-2">
      <div className="grid px-2 leading-tight">
        <span className="truncate text-sm font-medium">{user.fullName}</span>
        <span className="text-muted-foreground truncate text-xs">{user.email}</span>
      </div>
      <form action={logoutAction}>
        <Button type="submit" variant="outline" size="sm" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
