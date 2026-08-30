import { PageSkeleton } from "@/components/states/loading-state";

/**
 * Shown while this section queries the database.
 *
 * Per section rather than once over the whole screen, so switching tabs shows
 * the new one loading instead of blanking the tab strip that was just used.
 * The access guard is in the layout above, so an unauthorized request is
 * redirected before anything here streams.
 */
export default function Loading() {
  return <PageSkeleton />;
}
