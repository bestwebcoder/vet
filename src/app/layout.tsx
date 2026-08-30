import type { Metadata } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { getSiteIconUrl } from "@/features/organizations/queries";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The display face for the public site's headings only.
 *
 * Loaded here because fonts belong to the document, but used nowhere in the
 * application itself: a serif reads as a brochure, and a clinical record wants
 * the same one sans face all the way down. Two weights and the italic — the
 * marketing pages set headlines with an italic second line, and nothing else
 * needs a third weight.
 */
const displaySerif = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
});

/**
 * The favicon follows the practice's uploaded logo, so a browser tab is
 * recognisable as this clinic rather than as a generic Next.js app.
 *
 * A function rather than a static object because the logo lives in the
 * database, not in the repo — an admin can change it from Settings and the
 * tab icon follows on the next load. `public/icon.svg` is the fallback for
 * an install that has not uploaded one yet.
 *
 * Declared here rather than as an `app/favicon.ico` file so exactly one
 * icon link is emitted: with both, the browser picks between them on its
 * own and the uploaded logo is not reliably the winner.
 */
export async function generateMetadata(): Promise<Metadata> {
  const iconUrl = await getSiteIconUrl();

  return {
    title: "TV Care",
    description: "Veterinary practice management for The Traveling Vet.",
    icons: { icon: [{ url: iconUrl ?? "/icon.svg" }], apple: [{ url: iconUrl ?? "/icon.svg" }] },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${displaySerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
