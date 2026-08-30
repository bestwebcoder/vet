import Link from "next/link";
import { PawPrint } from "lucide-react";
import { createElement } from "react";

import type { ServiceSummary } from "@/features/services/queries";
import { iconByKey } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * One category of services on the public page: a card carrying the category's
 * icon, name and blurb, holding one block per service.
 *
 * The nesting is the point — a service belongs to a category, and the old
 * layout said so only by proximity: a bare heading above a grid of cards that
 * looked exactly like the cards of the category above it, so a long list read
 * as one undifferentiated wall. Now the category is the card and each service
 * is a block inside it.
 *
 * Every word here comes from the database — the category's name, description
 * and icon, and each service's tagline, inclusions and fee. Nothing is written
 * into this file, which is the point: a practice changes its prices and its
 * wording from Admin → Services, not by asking for a deploy (CLAUDE.md §9.4).
 */

function FeeBlock({ service }: { service: ServiceSummary }) {
  const label = service.feeLabel ?? "Fee";

  // A practice that has not written display pricing gets the billable price
  // formatted, which is what this page showed before display pricing existed.
  const tiers =
    service.feeTiers.length > 0
      ? service.feeTiers
      : [{ amount: service.price, qualifier: null }];

  // "Fee upon enquiry" and the like: one tier, no figure to line up, so it
  // reads as a sentence rather than a price.
  const isNarrative = service.feeTiers.length === 1 && !/\d/.test(service.feeTiers[0].amount);

  return (
    <div className="border-marketing-rule mt-auto border-t pt-4">
      {isNarrative ? (
        <p className="font-display text-marketing-grove text-base italic">{tiers[0].amount}</p>
      ) : (
        <>
          <p className="text-marketing-quiet text-[0.68rem] font-bold tracking-[0.14em] uppercase">{label}</p>
          {tiers.map((tier, index) => (
            <p key={`${tier.amount}-${index}`} className="font-display text-marketing-forest text-lg font-semibold">
              <span data-numeric>{tier.amount}</span>
              {tier.qualifier ? (
                <span className="text-marketing-quiet ml-1 text-sm font-normal">/ {tier.qualifier}</span>
              ) : null}
            </p>
          ))}
        </>
      )}

      {service.feeNote ? (
        <p className="text-marketing-quiet mt-1 text-xs italic">{service.feeNote}</p>
      ) : null}
    </div>
  );
}

/**
 * One service, inside its category's card.
 *
 * Parchment on the card's white rather than white on the page's parchment:
 * the same two colours the page already uses, swapped round, so a block reads
 * as part of the card holding it instead of as a card of its own. Its accent
 * moved to the left edge for the same reason — the top edge is the outer
 * card's, and two horizontal accents stacked read as two peers.
 */
function ServiceBlock({
  service,
  accent,
  bookingHref,
}: {
  service: ServiceSummary;
  accent: "grove" | "gold";
  bookingHref: string;
}) {
  return (
    <article
      className={cn(
        "border-marketing-rule bg-marketing-parchment flex flex-col border border-l-[3px] p-5 transition-colors sm:p-6",
        accent === "grove" ? "border-l-marketing-grove/70" : "border-l-marketing-gold/70",
      )}
    >
      <h3
        className={cn(
          "font-display text-lg leading-snug font-semibold",
          accent === "grove" ? "text-marketing-forest" : "text-marketing-grove",
        )}
      >
        {service.name}
      </h3>

      {service.tagline ? (
        <p className="text-marketing-quiet mt-2 text-[0.82rem] italic">{service.tagline}</p>
      ) : service.description ? (
        <p className="text-marketing-quiet mt-2 text-[0.82rem] italic">{service.description}</p>
      ) : null}

      {service.inclusions.length > 0 ? (
        <>
          <p className="text-marketing-gold mt-4 text-[0.7rem] font-bold tracking-[0.14em] uppercase">
            {service.inclusionsLabel ?? "What's included"}
          </p>
          <ul className="mt-2 mb-5 flex-1">
            {service.inclusions.map((item, index) => (
              <li
                key={`${item}-${index}`}
                className="border-b-marketing-rule/50 relative border-b py-1.5 pl-5 text-sm leading-relaxed last:border-b-0"
              >
                <span
                  aria-hidden
                  className="bg-marketing-gold absolute top-1/2 left-0 size-[5px] -translate-y-1/2 rounded-full"
                />
                {item}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mb-5 flex-1" />
      )}

      <FeeBlock service={service} />

      {/* Where this leads is decided per request, not per service: someone
          signed in goes to their own dashboard, and someone who is not goes to
          sign in — see the pages that pass it down. */}
      <Link
        href={bookingHref}
        className={cn(
          "mt-4 inline-flex min-h-11 items-center justify-center rounded-sm px-6 text-[0.72rem] font-bold tracking-[0.12em] uppercase transition-colors",
          accent === "grove"
            ? "bg-marketing-forest hover:bg-marketing-grove text-white"
            : "bg-marketing-gold text-marketing-forest hover:bg-marketing-gold-light",
        )}
      >
        Book Appointment
        <span className="sr-only"> — {service.name}</span>
      </Link>
    </article>
  );
}

/**
 * `createElement` rather than binding the looked-up icon to a capitalised
 * local and rendering `<Icon />`: the icon comes from a fixed allowlist
 * (src/lib/icons.ts), but assigning a component inside a render body is a
 * shape the react-hooks/static-components rule cannot tell apart from
 * defining one there — which really would remount on every render.
 */
function CategoryIcon({ icon }: { icon: string | null }) {
  return createElement(iconByKey(icon) ?? PawPrint, {
    "aria-hidden": true,
    className: "text-marketing-gold size-5",
  });
}

export function ServiceCategorySection({
  name,
  description,
  icon,
  services,
  /** Consulting and training read as advisory work, and are accented in gold. */
  accent = "grove",
  wide = false,
  bookingHref,
}: {
  name: string;
  description: string | null;
  icon: string | null;
  services: ServiceSummary[];
  accent?: "grove" | "gold";
  wide?: boolean;
  /** Where each block's Book button leads — resolved from the session by the page. */
  bookingHref: string;
}) {
  return (
    <section
      id={name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}
      className="scroll-mt-20 py-6 first:pt-12 sm:py-8 sm:first:pt-16"
    >
      <div
        className={cn(
          // Three nested paddings — page, card, block — would leave a phone
          // barely 260px of line, so the outer card gives most of its back.
          "border-marketing-rule border border-t-[3px] bg-white p-4 sm:p-8 lg:p-10",
          accent === "grove" ? "border-t-marketing-grove" : "border-t-marketing-gold",
        )}
      >
        {/* The icon sits with the heading, not with the block: aligning it to
            the bottom of a two-line blurb leaves the title floating above it. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
          <span className="bg-marketing-forest mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full">
            <CategoryIcon icon={icon} />
          </span>

          <div>
            <h2 className="font-display text-marketing-forest text-2xl leading-tight font-semibold sm:text-3xl">
              {name}
            </h2>
            {description ? (
              <p className="text-marketing-quiet mt-1 max-w-2xl text-[0.95rem] leading-relaxed">{description}</p>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "mt-8 grid gap-5",
            wide ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          {services.map((service) => (
            <ServiceBlock key={service.id} service={service} accent={accent} bookingHref={bookingHref} />
          ))}
        </div>
      </div>
    </section>
  );
}
