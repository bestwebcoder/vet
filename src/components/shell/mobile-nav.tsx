"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { NavLinks } from "@/components/shell/nav-links";
import { AREAS, type Area } from "@/components/shell/navigation";
import type { RoleSlug } from "@/features/auth/session";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileNav({ areaKey, roles }: { areaKey: Area["key"]; roles: RoleSlug[] }) {
  const [open, setOpen] = useState(false);
  const areaLabel = AREAS[areaKey].label;

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
          <SheetTitle>TV Care</SheetTitle>
          <SheetDescription>{areaLabel}</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto p-3">
          <NavLinks areaKey={areaKey} roles={roles} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
