"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

/** Wraps the app in next-themes so `dark:` variants respond to a stored preference, not just CSS alone. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemeProvider>
  );
}
