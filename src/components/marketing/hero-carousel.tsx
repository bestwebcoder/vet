"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type HeroCarouselImage = { src: string; alt: string; caption?: string | null };

/**
 * A small auto-advancing crossfade carousel for the front page hero.
 *
 * No carousel library: this is one interval and an opacity transition, not
 * worth a dependency for. Pauses on hover/focus so a visitor reading the
 * doctor's name under a slide isn't fighting the timer.
 */
export function HeroCarousel({ images }: { images: HeroCarouselImage[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (images.length < 2 || paused) return;

    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % images.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [images.length, paused]);

  return (
    <div
      className="relative aspect-4/3 w-full overflow-hidden rounded-2xl shadow-md"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {images.map((image, i) => (
        <div
          key={image.src}
          className={cn(
            "absolute inset-0 size-full transition-opacity duration-700",
            i === index ? "opacity-100" : "opacity-0",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary-dimension public images (org hero, doctor photos); no build-time optimization to gain here. */}
          <img
            src={image.src}
            alt={image.alt}
            loading={i === 0 ? "eager" : "lazy"}
            className="size-full object-cover"
          />
          {image.caption ? (
            <p className="from-foreground/70 absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t to-transparent px-4 pt-10 pb-8 text-sm font-medium text-white sm:text-base">
              {image.caption}
            </p>
          ) : null}
        </div>
      ))}

      {images.length > 1 ? (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {images.map((image, i) => (
            <button
              key={image.src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show slide ${i + 1}`}
              aria-current={i === index}
              className={cn(
                "size-2 rounded-full transition-colors",
                i === index ? "bg-primary-foreground" : "bg-primary-foreground/40",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
