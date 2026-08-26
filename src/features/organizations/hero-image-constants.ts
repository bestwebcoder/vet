/**
 * Split from hero-image.ts so a client component (the gallery form) can
 * import the cap without pulling in that file's server-only Supabase client.
 */
export const MAX_HERO_IMAGES = 6;
