import { TeamPager } from "@/components/marketing/team-pager";
import type { PublicDoctor } from "@/features/doctors/queries";

/**
 * A different four doctors on every visit rather than always the same
 * ones first (small practices tend to have their team roughly
 * alphabetical or by hire date otherwise, which quietly favours whoever's
 * name comes first) — shuffled here, server-side, so the order is settled
 * before this ever reaches the client and there's nothing for hydration to
 * disagree about.
 */
function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Photo-forward preview of the practice's doctors — one row, paged with Previous/Next. Each opens a popup with their full details. /doctors (linked from the main nav) has the complete roster. */
export function TeamGallery({ doctors }: { doctors: PublicDoctor[] }) {
  const withPhoto = shuffled(doctors.filter((doctor) => doctor.photoUrl));
  if (withPhoto.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-center text-2xl font-semibold tracking-tight">Meet our team</h2>
      <TeamPager doctors={withPhoto} />
    </section>
  );
}
