<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TV Care repository guide

TV Care is a mobile-first veterinary practice management application for The
Traveling Vet. Read `CLAUDE.md` and the relevant file under `docs/phases/`
before implementing a module. Preserve the medical-safety, privacy, audit, and
role requirements defined there.

## Architecture

- Next.js 16 App Router, React Server Components by default, TypeScript strict
- Supabase PostgreSQL, Auth, private Storage, and Row Level Security
- Tailwind CSS v4 and shared UI primitives under `src/components/ui/`
- Zod validation shared by server actions and forms; React Hook Form where useful
- Vitest unit, database, RLS, and HTTP integration tests
- `src/app/`: routes and layouts by client, doctor, and admin role
- `src/features/`: domain queries and server actions
- `src/lib/`: environment, validation, formatting, and Supabase clients
- `supabase/migrations/`: ordered, immutable schema history
- `tests/`: cross-role, database, storage, and production-route tests

## Coding conventions

- Inspect existing code and relevant Next.js 16 bundled documentation before
  changing framework behavior. Do not rely on older Next.js conventions.
- Use Server Components by default. Keep client components narrowly scoped.
- Use `src/proxy.ts` for session refresh; authorization belongs in server
  layouts/actions and is enforced definitively by PostgreSQL RLS.
- Reuse existing components, forms, validation schemas, queries, actions,
  loading states, empty states, and error states.
- Keep protected data database-backed. Never hard-code users, doctors,
  patients, prices, clinical schedules, or medical decisions.
- Validate untrusted input on the server and return professional errors without
  exposing raw technical details.
- Preserve UUID identifiers, tenant boundaries, soft deletion, clinical
  history, and auditability. Do not silently overwrite finalized records.
- Maintain mobile-first, accessible UI and the existing sage design system.
- Do not independently diagnose or prescribe; clinical decisions remain with
  the attending veterinarian.

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run db:start
npm run db:stop
npm run db:reset
npm run db:diff
npm run seed:demo
```

Local development requires the variables named in `.env.example`. Never print,
copy into source, or commit real credentials. The service-role key is
server-only and bypasses RLS.

## Verification requirements

- For code changes, run `npm run lint`, `npm run typecheck`, relevant tests,
  and `npm run build` before handoff unless the environment prevents it.
- Run the full `npm test` suite for database, authentication, RLS, storage,
  route, or shared behavior changes. Tests expect the local Supabase stack and
  build/start the app on a local port.
- Add regression tests for fixes and explicit cross-role/RLS tests for new data.
- Verify migrations from an empty local database and test affected permissions.
- Do not claim mobile, accessibility, security, or production readiness based
  only on visual inspection.

## Supabase, authentication, and RLS

- All schema changes use a new ordered SQL migration. Never edit an already
  applied migration, drop production data, or use destructive resets remotely.
- Keep grants, column privileges, RLS policies, constraints, indexes, triggers,
  storage policies, and audit behavior in sync with each new table or field.
- Normal application access uses the signed-in user's anon-key client. Do not
  use the service role to bypass authorization in product flows.
- Clients may access only their own records. Doctors may access only assigned or
  explicitly authorized patients. Admins are scoped to their organization.
- Clients cannot edit SOAP or other clinician-owned records and see only
  explicitly client-visible clinical documents.
- Treat route guards as UX, not the security boundary. Enforce ownership,
  organization scope, allowed mutations, and immutable history in PostgreSQL.
- Keep storage buckets private and issue short-lived signed URLs only after
  authorization. Validate upload type and size server-side.
- Important mutations and authentication events must remain auditable.

## Change safety

- Preserve existing working functionality and user changes. Make the smallest
  coherent change and avoid unrelated rewrites or destructive Git operations.
- Do not replace real database behavior with mocks or placeholders.
- Do not modify `CLAUDE.md` unless the user explicitly requests it.
- Do not commit, push, open or merge pull requests, deploy, contact external
  services, or modify production/remote data without explicit user permission.
- Local database resets destroy local data; run them only when clearly required
  and never against a remote project.
