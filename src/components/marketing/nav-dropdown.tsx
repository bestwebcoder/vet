import Link from "next/link";
import { ChevronDown } from "lucide-react";

import type { NavMenuTreeItem } from "@/features/nav-menu/queries";

/**
 * A top-level nav item with dropdown children — pure CSS hover (:hover via
 * `group`, :focus-within for keyboard users), no client JS needed. The
 * invisible wrapper's own top padding (not the visible panel's margin)
 * keeps the hoverable area contiguous from trigger to panel, so there's no
 * dead zone a moving pointer can fall through.
 */
export function NavDropdown({ item }: { item: NavMenuTreeItem }) {
  return (
    <div className="group relative">
      <Link
        href={item.href}
        target={item.opensNewTab ? "_blank" : undefined}
        rel={item.opensNewTab ? "noopener noreferrer" : undefined}
        className="hover:text-foreground flex items-center gap-1 text-sm font-medium"
      >
        {item.label}
        <ChevronDown className="size-3.5" aria-hidden />
      </Link>

      <div className="invisible absolute top-full left-0 z-30 pt-2 opacity-0 transition-[opacity,visibility] duration-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="bg-popover ring-foreground/10 grid min-w-44 gap-0.5 rounded-lg p-1.5 shadow-md ring-1">
          {item.children.map((child) => (
            <Link
              key={child.id}
              href={child.href}
              target={child.opensNewTab ? "_blank" : undefined}
              rel={child.opensNewTab ? "noopener noreferrer" : undefined}
              className="hover:bg-muted rounded-md px-2.5 py-2 text-sm"
            >
              {child.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
