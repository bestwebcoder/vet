import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The full-bleed forest bands that open and close a public page.
 *
 * One component for both because they are the same object with different
 * words in it: a dark ground, a radial lift from below, a serif headline whose
 * second line goes italic gold, and one call to action. Two copies of that
 * drifted apart the first time somebody adjusted the gradient.
 *
 * The colours are the marketing tokens, which are fixed rather than
 * theme-aware — see globals.css. A brochure does not have a dark mode.
 */
export function MarketingBand({
  eyebrow,
  title,
  italicTitle,
  subtitle,
  action,
  size = "hero",
}: {
  /** Small gold caps above the headline, flanked by rules. */
  eyebrow?: string;
  title: string;
  /** The second line, set italic in gold. Optional — a closing band rarely has one. */
  italicTitle?: string;
  subtitle?: string;
  action?: { label: string; href: string };
  size?: "hero" | "closing";
}) {
  return (
    <section
      className={cn(
        "bg-marketing-forest relative overflow-hidden px-4 text-center sm:px-6",
        size === "hero" ? "py-16 sm:py-24 lg:py-28" : "py-14 sm:py-20",
      )}
    >
      {/* The lift from below, and a faint warm wash from the top left. Two
          radials rather than an image: it costs nothing and never fails to
          load on a slow connection. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 110%, color-mix(in oklab, var(--marketing-grove) 70%, transparent) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 20% 0%, color-mix(in oklab, var(--marketing-gold) 8%, transparent) 0%, transparent 60%)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center">
        {eyebrow ? (
          <p className="text-marketing-gold-light flex items-center gap-3 text-[0.7rem] font-semibold tracking-[0.22em] uppercase">
            <span aria-hidden className="bg-marketing-gold/60 hidden h-px w-8 sm:block" />
            {eyebrow}
            <span aria-hidden className="bg-marketing-gold/60 hidden h-px w-8 sm:block" />
          </p>
        ) : null}

        <h1
          className={cn(
            "font-display mt-5 leading-[1.15] font-semibold text-white text-balance",
            size === "hero" ? "text-4xl sm:text-5xl lg:text-[4rem]" : "text-3xl sm:text-4xl lg:text-5xl",
          )}
        >
          {title}
          {italicTitle ? (
            <>
              <br />
              <em className="text-marketing-gold-light not-italic italic">{italicTitle}</em>
            </>
          ) : null}
        </h1>

        {subtitle ? (
          <p className="mt-5 max-w-xl text-base leading-relaxed font-light text-white/70 text-balance">{subtitle}</p>
        ) : null}

        {action ? (
          <Link
            href={action.href}
            className="bg-marketing-gold text-marketing-forest hover:bg-marketing-gold-light mt-9 inline-flex min-h-11 items-center rounded-sm px-9 text-[0.78rem] font-bold tracking-[0.12em] uppercase transition-colors"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** The hairline that separates a band from the page below it. */
export function GoldRule() {
  return (
    <div
      aria-hidden
      className="h-px w-full"
      style={{
        background:
          "linear-gradient(90deg, transparent, var(--marketing-gold), transparent)",
      }}
    />
  );
}
