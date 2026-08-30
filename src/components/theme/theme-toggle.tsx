"use client";

import { useSyncExternalStore } from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/**
 * A two-position slider between light and dark — both choices are visible, and
 * the thumb slides between them.
 *
 * "System" is deliberately not a third position: it stays the default for
 * someone who has never touched this (see ThemeProvider), but once they do
 * choose, the choice is explicit and sticks. A three-way cycle through a
 * single button meant you could not tell what the next click would give you.
 *
 * Reads `resolvedTheme` rather than `theme`, so an untouched "system" still
 * shows the side the viewer is actually looking at.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // True only once the client has hydrated — server and client snapshots
  // deliberately differ so this stays false during the first client render,
  // matching the server-rendered placeholder before the real theme is known.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  // Same box either way, so hydrating the real control shifts nothing around it.
  const track = cn("bg-input dark:bg-input/60 relative inline-flex h-8 w-14 shrink-0 items-center rounded-full", className);

  if (!mounted) return <span className={track} aria-hidden />;

  const isDark = resolvedTheme === "dark";

  return (
    <SwitchPrimitive.Root
      checked={isDark}
      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      aria-label={isDark ? "Dark theme. Switch to light." : "Light theme. Switch to dark."}
      className={cn(
        track,
        "group focus-visible:ring-ring/50 cursor-pointer border border-transparent transition-colors outline-none focus-visible:ring-3",
      )}
    >
      {/* Above the thumb, so whichever icon it slides under stays legible. */}
      <Sun
        className="text-primary-foreground group-data-checked:text-muted-foreground pointer-events-none absolute left-2 z-10 size-4 transition-colors"
        aria-hidden
      />
      <Moon
        className="text-muted-foreground group-data-checked:text-primary-foreground pointer-events-none absolute right-2 z-10 size-4 transition-colors"
        aria-hidden
      />
      {/* Sage rather than `bg-background`: the knob has to read against the
          track in both themes, and a background-coloured knob vanishes into
          the dark track. Primary is darker than the track in light and
          lighter in dark, so `primary-foreground` carries the active icon
          either way. */}
      <SwitchPrimitive.Thumb className="bg-primary pointer-events-none block size-7 translate-x-0.5 rounded-full shadow-sm ring-0 transition-transform data-checked:translate-x-[26px]" />
    </SwitchPrimitive.Root>
  );
}
