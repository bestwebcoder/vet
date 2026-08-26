"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import Link from "next/link";

import { PUBLIC_NAV_LINKS } from "@/components/marketing/nav-links";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function PublicMobileNav({ homeHref = null }: { homeHref?: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon-lg" aria-label="Open menu" className="lg:hidden">
            <Menu />
          </Button>
        }
      />
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b">
          <div className="flex items-center gap-2.5">
            <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold">
              TV
            </span>
            <span>
              <SheetTitle>TV Care</SheetTitle>
              <SheetDescription>The Traveling Vet</SheetDescription>
            </span>
          </div>
        </SheetHeader>
        <nav className="grid gap-1 p-3">
          {PUBLIC_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="hover:bg-muted flex min-h-11 items-center rounded-lg px-3 text-sm font-medium"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-3 grid gap-2 border-t pt-3">
            {homeHref ? (
              <Link href={homeHref} onClick={() => setOpen(false)} className={cn(buttonVariants({ size: "touch" }), "w-full")}>
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" onClick={() => setOpen(false)} className={cn(buttonVariants({ variant: "outline", size: "touch" }), "w-full")}>
                  Sign in
                </Link>
                <Link href="/register" onClick={() => setOpen(false)} className={cn(buttonVariants({ size: "touch" }), "w-full")}>
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
