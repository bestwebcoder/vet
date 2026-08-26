import { PageSkeleton } from "@/components/states/loading-state";

/**
 * Shown while this list queries the database.
 *
 * Deliberately scoped to the list, not the whole section: every notFound() in
 * this app sits under a dynamic [param] segment, and a boundary above one of
 * those turns its 404 into a streamed 200. The access guard lives higher still
 * (the area layout, or an /admin access-group layout), so an unauthorized
 * request is redirected with a 307 before anything here streams.
 */
export default function Loading() {
  return <PageSkeleton />;
}
