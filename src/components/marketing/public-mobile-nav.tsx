"use client";

import { useState } from "react";
import { ChevronDown, Menu } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavMenuTreeItem } from "@/features/nav-menu/queries";
import { cn } from "@/lib/utils";

function MobileNavDropdown({ item, onNavigate }: { item: NavMenuTreeItem; onNavigate: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="hover:bg-muted flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-sm font-medium"
      >
        {item.label}
        <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
      </button>
      {expanded ? (
        <div className="ml-3 grid gap-1 border-l pl-3">
          {item.children.map((child) => (
            <Link
              key={child.id}
              href={child.href}
              target={child.opensNewTab ? "_blank" : undefined}
              rel={child.opensNewTab ? "noopener noreferrer" : undefined}
              onClick={onNavigate}
              className="hover:bg-muted flex min-h-11 items-center rounded-lg px-3 text-sm"
            >
              {child.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PublicMobileNav({
  homeHref = null,
  navItems = [],
}: {
  homeHref?: string | null;
  navItems?: NavMenuTreeItem[];
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

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
          {navItems.map((item) =>
            item.children.length > 0 ? (
              <MobileNavDropdown key={item.id} item={item} onNavigate={close} />
            ) : (
              <Link
                key={item.id}
                href={item.href}
                target={item.opensNewTab ? "_blank" : undefined}
                rel={item.opensNewTab ? "noopener noreferrer" : undefined}
                onClick={close}
                className="hover:bg-muted flex min-h-11 items-center rounded-lg px-3 text-sm font-medium"
              >
                {item.label}
              </Link>
            ),
          )}
          <div className="mt-3 grid gap-2 border-t pt-3">
            {homeHref ? (
              <Link href={homeHref} onClick={close} className={cn(buttonVariants({ size: "touch" }), "w-full")}>
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" onClick={close} className={cn(buttonVariants({ variant: "outline", size: "touch" }), "w-full")}>
                  Sign in
                </Link>
                <Link href="/register" onClick={close} className={cn(buttonVariants({ size: "touch" }), "w-full")}>
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
