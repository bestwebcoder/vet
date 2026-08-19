# Building TV Care with Claude Code — Step-by-Step Guide

*Veterinary Practice Management System for The Traveling Vet, Bangladesh*

---

## 0. What changes now that you're not using Lovable

Your spec was written for Lovable, which bundles a database, auth, hosting, and a preview window. Claude Code gives you none of that — it is an agent that edits files and runs commands in your terminal. That means:

| You now decide | Lovable decided for you |
|---|---|
| Framework | React + Vite |
| Database & auth | Supabase |
| Hosting | Lovable-hosted |
| Migrations | Auto-applied |
| Preview | Built-in |

The upside is you own the code, there's no vendor lock-in, and you can enforce real migrations and real tests. The downside is you must set up the plumbing once, up front. That's Step 1–4 below, roughly one evening.

Everything in **sections 33–37 of your spec** (phased build, don't build everything at once, verify before moving on) still applies word for word. Claude Code will happily try to build all ten phases in one go if you let it. Don't let it.

---

## 1. Choose your stack

My recommendation, tuned to what your spec actually asks for:

| Layer | Choice | Why this one |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Server components keep patient data off the client by default — matters for spec §24. One codebase for the client portal, doctor app, and admin. |
| Styling | **Tailwind CSS + shadcn/ui** | shadcn gives you accessible, unstyled-by-default components you can theme to the sage/off-white system in §27, instead of fighting a pre-branded library. |
| Database | **PostgreSQL via Supabase** | Spec §26 requires Postgres. Supabase gives you Postgres + Auth + Storage + Row Level Security in one product. RLS is how you enforce "never expose another client's patient data" *at the database level*, not just in app code. |
| Auth | **Supabase Auth** | Email/password, verification, password reset — all in §24 — without writing them. |
| File storage | **Supabase Storage** | For X-rays, lab reports, pet photos (§23). |
| PDF generation | **React-PDF (@react-pdf/renderer)** rendered server-side | Prescriptions and invoices (§13, §18). Deterministic output, no headless-browser hosting headaches. |
| Forms & validation | **React Hook Form + Zod** | One Zod schema per entity, reused for client-side validation *and* server-side API validation (§32). |
| Charts | **Recharts** | Reports module (§21). |
| Hosting | **Vercel** (app) + **Supabase** (data) | Both have generous free tiers to develop on. |

**If you'd rather not use Supabase**: swap in Postgres on Neon or Railway, Drizzle ORM for migrations, and Auth.js for authentication. Everything else in this guide is unchanged — but you will write your own RLS policies or enforce access purely in the app layer, which is more code and more risk. For a system holding clinical records, I'd take the RLS.

---

## 2. Prerequisites

Before touching Claude Code:

1. **Node.js 22+** — https://nodejs.org (Claude Code's npm package requires 22+; the native installer doesn't need Node at all, but Next.js does).
2. **Git** — https://git-scm.com. On Windows, install Git for Windows regardless; Claude Code uses Git Bash for its shell.
3. **A GitHub account** and an empty private repo named `tv-care`.
4. **A Supabase account** — https://supabase.com. Create a project, region **Singapore** (closest to Dhaka, lowest latency).
5. **A Claude subscription** — Pro, Max, Team, Enterprise, or a Console (API) account. The free Claude.ai plan does not include Claude Code. For a project this size, Max is worth costing out against pay-as-you-go API usage.
6. **A code editor** — VS Code is fine. You'll mostly watch Claude Code work and read diffs.

---

## 3. Install Claude Code

**macOS / Linux / WSL:**
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://claude.ai/install.ps1 | iex
```

Verify:
```bash
claude --version     # should print something like 2.1.211 (Claude Code)
claude doctor        # diagnostics if anything looks off
```

Then log in — run `claude` in any folder and follow the browser prompt.

Full install docs, including Homebrew, WinGet, and apt/dnf/apk: https://code.claude.com/docs/en/setup

---

## 4. Scaffold the project yourself (don't make Claude Code do this)

Scaffolding is deterministic. Running the official CLI takes thirty seconds and gets it exactly right; asking an agent to hand-write a Next.js skeleton burns tokens and invents subtle mistakes. Do it manually:

```bash
npx create-next-app@latest tv-care --typescript --tailwind --app --eslint --src-dir --import-alias "@/*"
cd tv-care
git init && git add -A && git commit -m "chore: scaffold Next.js app"

# UI components
npx shadcn@latest init

# Core dependencies
npm install @supabase/supabase-js @supabase/ssr zod react-hook-form @hookform/resolvers date-fns recharts @react-pdf/renderer

# Dev dependencies
npm install -D vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react

# Supabase CLI for migrations
npm install -D supabase
npx supabase init
```

Push to GitHub. Now you have a clean baseline you can always `git reset` to.

---

## 5. Put the spec in the repo, split into phase files

This is the highest-leverage step in the whole guide.

Your spec is ~5,000 words. Pasting all of it into every Claude Code conversation wastes context and dilutes attention — the agent reads about billing while trying to build authentication. Split it instead:

```bash
mkdir -p docs/phases
```

Save your original document as `docs/SPEC.md`, then start Claude Code and give it this **one-time** task:

> Read `docs/SPEC.md`. It's the full product specification for TV Care, a veterinary practice management system. Split it into separate files under `docs/phases/` — one per phase as defined in section 33 of the spec (`phase-01-foundation.md` through `phase-10-polish.md`).
>
> Each phase file must contain: the phase's own build list from §33, plus the *full text* of every other spec section that phase depends on. For example, `phase-04-clinical.md` must include all of §11 (SOAP system) and the relevant parts of §24, §25, and §26.
>
> Sections that apply to every phase — §24 security, §25 audit log, §27 UI direction, §34 development rules, §36 medical safety — go into `docs/ALWAYS.md` instead of being repeated in each phase file. Don't summarise or paraphrase anything; move the text verbatim. Don't write any application code.

Result: when you build Phase 4, you load one focused file instead of the whole spec.

---

## 6. Write CLAUDE.md

`CLAUDE.md` sits at the repo root and is auto-loaded into every Claude Code session. It's your standing instructions — the equivalent of §34 and §35 of your spec, but permanently in context.

I've written one for you: **`CLAUDE.md`** (attached below this guide). Drop it at the repo root and commit it.

Keep it short. A 500-line CLAUDE.md gets skimmed; a 100-line one gets followed. Add to it only when you catch Claude Code making the same mistake twice — that's the signal a rule is missing.

---

## 7. Configure permissions

By default Claude Code asks before every file write and command. That gets tedious across a 10-phase build. Create `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run:*)",
      "Bash(npx supabase:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Edit",
      "Write"
    ],
    "deny": [
      "Bash(npx supabase db reset:*)",
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)",
      "Read(./.env*)"
    ]
  }
}
```

The `deny` list matters more than the allow list. `supabase db reset` drops your data — spec rule 34.18 says never destroy existing data on schema change, so make it impossible rather than relying on good behaviour. `Read(./.env*)` keeps your Supabase service-role key out of the transcript.

Commit this file. Keep `.env.local` in `.gitignore`.

---

## 8. The working loop (this is the actual method)

For every phase, and every meaningful task inside a phase, run this loop. It's four steps and you will run it a few hundred times.

### Step 1 — Fresh context
```
/clear
```
Start each new task with a clean slate. Stale context from the last task is the single biggest cause of an agent "helpfully" refactoring something that was already working (spec rule 34.1).

### Step 2 — Plan before code

Press **Shift+Tab twice** to enter Plan Mode. Claude Code will read the codebase and propose an approach without writing anything. Then:

```
Read docs/ALWAYS.md and docs/phases/phase-03-appointments.md.

Before writing any code:
1. Inspect the existing project structure and tell me what already exists that's relevant.
2. List the database tables this phase touches — new and modified.
3. List the user roles affected and what each can do.
4. Give me an implementation plan, ordered, with a checkpoint I can test after each step.

Don't write code yet. Ask me about anything ambiguous.
```

That prompt is section 35 of your spec, verbatim, turned into an instruction. **Read the plan properly.** This is where you catch bad decisions for free — after implementation they cost you an hour.

### Step 3 — Implement one checkpoint at a time

```
The plan looks good. Implement step 1 only — the database migration and RLS policies for the appointments tables. Stop after that so I can review and run it.
```

Resist "do the whole plan." Small increments mean small diffs, and small diffs are diffs you'll actually read.

### Step 4 — Verify, then commit

Run it yourself. Click through it on your phone, not just your laptop — §27 says mobile-first and that's not a slogan for a vet doing home visits in Dhaka traffic.

```
git add -A && git commit -m "feat(appointments): schema + RLS policies"
```

Commit after every green checkpoint. When Claude Code goes off the rails — it will, occasionally — `git reset --hard HEAD` costs you ten minutes instead of a day.

### Two habits worth forming

- **When it's wrong, don't argue — reset and re-prompt.** Long correction threads pollute context. `/clear`, then ask again with the constraint you were missing stated up front.
- **Use `/compact` around 60% context**, not at 95%. Late compaction loses detail you needed.

---

## 9. Phase-by-phase prompts

Here's the opening prompt for each phase. Run the Step 1–4 loop within each.

### Phase 1 — Foundation
> Read `docs/ALWAYS.md` and `docs/phases/phase-01-foundation.md`.
>
> Plan Phase 1 only. Scope: Supabase client setup (server + browser), database migration for `organizations`, `branches`, `users`, `roles`, `user_roles`; Supabase Auth wiring with email verification and password reset; middleware-based route protection; RLS policies enforcing role separation; the design system (Tailwind theme + shadcn tokens) for the palette in §27; responsive navigation shells for client/doctor/admin; and three empty dashboard shells.
>
> Seed exactly one organization: The Traveling Vet. No other seed data. No dashboard content beyond layout.

**Do not leave Phase 1 until**: you can register a client, verify email, log in, and get bounced from `/admin`; and a doctor logging in cannot reach client-only routes. Test with three real accounts.

### Phase 2 — Patient management
> Read `docs/ALWAYS.md` and `docs/phases/phase-02-patients.md`. Plan Phase 2 only.
>
> Tables: `clients`, `pets`, `species`, `breeds`. Build the pet CRUD, the pet profile page with the nine tabs from §8 (tabs beyond Overview render "coming in a later phase" placeholders, not fake data), and photo upload to Supabase Storage.
>
> Species and breeds come from the database and are admin-editable. Do not hard-code them.

### Phase 3 — Appointments
> Read `docs/ALWAYS.md` and `docs/phases/phase-03-appointments.md`. Plan Phase 3 only.
>
> Critical constraint: double-booking must be impossible. Enforce it with a database-level exclusion constraint on (doctor, time range), not just an application check. Two clients tapping "confirm" at the same instant must not both succeed.
>
> All times stored as `timestamptz`, displayed in Asia/Dhaka.

### Phase 4 — Clinical / SOAP
> Read `docs/ALWAYS.md` and `docs/phases/phase-04-clinical.md`. Plan Phase 4 only.
>
> The SOAP form has ~40 fields across four sections. Build it as a multi-step form with autosave to draft — a vet mid-consultation cannot lose fifteen minutes of notes to a dropped connection.
>
> Finalized SOAP records are immutable: edits create a new version and write to `audit_logs`. Never `UPDATE` a finalized record in place.

### Phase 5 — Prescriptions
> Read `docs/ALWAYS.md` and `docs/phases/phase-05-prescriptions.md`. Plan Phase 5 only.
>
> Re-read §12 and §36 before you start. The dose calculator does exactly one thing: multiply body weight by the dose-per-kg the *doctor entered*. It must never suggest a drug, a dose, a route, a frequency, or a duration. No autocomplete that ranks by "commonly used for this diagnosis." No defaults.
>
> Block prescription creation if patient weight is missing. Show the §12 warning text on every prescription screen and on the PDF.

### Phase 6 — Vaccination & deworming
> Read `docs/ALWAYS.md` and `docs/phases/phase-06-vaccination.md`. Plan Phase 6 only.
>
> Schedules live in `vaccination_schedules` and are admin-editable (§14 — do not hard-code). The next-due calculation reads from that table. Reminder states (30d / 7d / due / overdue) are computed at query time, not stored — a stored flag goes stale the moment nobody runs the job.

### Phase 7 — Billing
> Read `docs/ALWAYS.md` and `docs/phases/phase-07-billing.md`. Plan Phase 7 only.
>
> Money: store as integers in poisha (1/100 BDT). Never floats. Invoice line totals, discounts, and VAT are computed and stored per line at issue time, so a later price change never rewrites a historical invoice.
>
> Payment methods per §19 including bKash and Nagad — manual recording only in this phase.

### Phase 8 — Reporting
> Read `docs/ALWAYS.md` and `docs/phases/phase-08-reporting.md`. Plan Phase 8 only.
>
> Reports are read-only aggregate queries. Use Postgres views or RPC functions, not client-side aggregation over fetched rows. Add indexes for every date-range filter. CSV and PDF export where §21 specifies.

### Phase 9 — Notifications
> Read `docs/ALWAYS.md` and `docs/phases/phase-09-notifications.md`. Plan Phase 9 only.
>
> Build the notification tables, the queue, the state machine (scheduled → sent → delivered → failed), and logging. Implement **email only** — the channel interface must make SMS, WhatsApp, and push pluggable later without schema changes (§16).

### Phase 10 — Polish
Don't prompt this as one task. Run it as separate passes, each with `/clear` between:

> Audit every RLS policy in the database. For each table, tell me exactly which role can select, insert, update, and delete, and whether any policy allows a client to reach another client's data. Report only — don't change anything yet.

> Review every form in the app for consistent validation, loading states, and error handling per §31 and §32. List inconsistencies as a table. Don't fix them yet.

> Test every page at 375px width. List anything that overflows, truncates, or requires horizontal scrolling.

---

## 10. Things that will bite you

**RLS is not optional and it is not obvious.** Supabase tables are wide open until you write policies. Before every phase ships, ask Claude Code: *"Write a test that logs in as client A and attempts to read client B's pets, and assert it returns zero rows."* Run it. A policy you didn't test is a policy that doesn't work.

**Timezones.** Store `timestamptz`, always. Display in Asia/Dhaka. An appointment showing 5:00 PM to the client and 11:00 AM to the doctor is a silent, expensive bug.

**Money.** Integers in poisha. Floats accumulate rounding error and your monthly revenue report will disagree with the sum of its invoices.

**Audit trails belong in the database.** Ask for Postgres triggers on the clinical tables, not app-layer logging. App-layer logging is skipped the moment someone adds a code path that forgets to call it.

**Soft delete everywhere clinical.** `deleted_at timestamptz`, and every query filters it. §25 requires clinical records survive.

**PDF fonts.** If you ever need Bangla text in a prescription or invoice, register a Bangla-capable font in React-PDF explicitly. The default font set renders it as boxes, and you'll find out from the printed copy.

**Draft autosave in the SOAP form.** Mentioned above but worth repeating — it's the feature vets will notice missing on the first bad-signal home visit.

---

## 11. Deployment

Once Phase 1 is stable, deploy immediately. Don't wait until Phase 10.

1. Push to GitHub, import the repo into Vercel.
2. Add environment variables in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (server-side only — never prefix it `NEXT_PUBLIC_`).
3. Create a **second** Supabase project as staging. Develop against staging, promote migrations to production with `npx supabase db push`.
4. Never run `supabase db reset` against production. That's why it's in the deny list in Step 7.

Deploying early means every phase gets tested on a real phone on real mobile data, which is the environment this system actually runs in.

---

## 12. What to expect

Realistically, ten phases at one to two weeks each if this is evenings-and-weekends work — call it three to five months to a system a practice can run on. Phases 1, 4, and 5 are the hard ones: foundation because everything depends on it, SOAP because it's forty fields of clinical nuance, prescriptions because the safety constraints are strict and the PDF has to look right on paper.

Claude Code will make Phase 1 feel fast and Phase 4 feel slow. That ratio is correct and it's not a sign anything is wrong.

Two things worth saying plainly before you start:

**Get a vet to review the SOAP and prescription modules before real patients touch them.** You have Dr. Nusrat Jahan in the spec as an example — someone with that clinical background should sign off on field names, units, and the prescription layout. An agent will produce something that looks right; only a clinician can tell you whether it *is* right.

**Look into Bangladesh's data protection requirements** for storing client contact details and clinical records before you go live, particularly if you later expand to multiple clinics. Worth an hour with someone who knows the current rules.

---

## Quick reference

| Task | Command |
|---|---|
| Start Claude Code | `claude` |
| Fresh context | `/clear` |
| Plan mode | Shift+Tab, Shift+Tab |
| Compact context | `/compact` |
| Check install health | `claude doctor` |
| New migration | `npx supabase migration new <name>` |
| Push migrations | `npx supabase db push` |
| Undo a bad session | `git reset --hard HEAD` |

Docs: https://code.claude.com/docs/en/overview
