-- The footer always rendered a hardcoded "TV" badge and hardcoded
-- copyright line, even though the real logo (organizations.logo_path) was
-- already available. One dedicated column for the one boolean setting the
-- footer needs — same shape as logo_path itself (20260906000100_organization_logo.sql),
-- a single admin-editable organization-level setting, not the site_content
-- KV table's shape (that assumes every value is display text with a text
-- default; a toggle doesn't fit it). Tagline and copyright-line overrides
-- are plain text, so those are new src/features/site-content/fields.ts
-- registry entries instead — no migration needed for those.

alter table public.organizations add column footer_show_logo boolean not null default true;

grant update (footer_show_logo) on public.organizations to authenticated;
