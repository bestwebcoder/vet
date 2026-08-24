"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

const NEXT: Record<string, "light" | "dark" | "system"> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const ICON = { light: Sun, dark: Moon, system: SunMoon };
const LABEL = { light: "Light theme", dark: "Dark theme", system: "System theme" };

const subscribe = () => () => {};

/** Cycles light → dark → system on click. Renders a stable placeholder until mounted, since the real theme is only known client-side. */
export function ThemeToggle({ size = "icon" }: { size?: VariantProps<typeof buttonVariants>["size"] }) {
  const { theme, setTheme } = useTheme();
  // True only once the client has hydrated — server and client snapshots
  // deliberately differ so this stays false during the first client render,
  // matching the server-rendered placeholder before the real theme is known.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const current = mounted ? ((theme as "light" | "dark" | "system") ?? "system") : "system";
  const Icon = ICON[current];

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-label={`Theme: ${LABEL[current]}. Click to change.`}
      onClick={() => setTheme(NEXT[current])}
    >
      {mounted ? <Icon aria-hidden /> : <span className="size-4" aria-hidden />}
    </Button>
  );
}
