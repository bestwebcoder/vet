/**
 * Honorifics and name prefixes to skip when addressing someone by first name.
 *
 * "Md." is included because it is an extremely common prefix on Bangladeshi
 * names — greeting a large share of users as "Md" would be plainly wrong.
 * Deliberately excludes the unabbreviated "Mohammad" and its spellings, which
 * are frequently the given name itself rather than a prefix.
 */
const HONORIFICS = new Set([
  "dr",
  "dr.",
  "prof",
  "prof.",
  "mr",
  "mr.",
  "mrs",
  "mrs.",
  "ms",
  "ms.",
  "md",
  "md.",
  "mst",
  "mst.",
  "engr",
  "engr.",
]);

/**
 * The name to greet someone by.
 *
 * Falls back to the full name rather than guessing when a name is a single
 * word or made up entirely of titles — a greeting that drops someone's name is
 * worse than one that uses all of it.
 */
export function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return fullName.trim();

  const named = parts.filter((part) => !HONORIFICS.has(part.toLowerCase()));

  return named[0] ?? parts.join(" ");
}
