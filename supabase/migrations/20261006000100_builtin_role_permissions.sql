-- ---------------------------------------------------------------------------
-- Giving the built-in roles their permission rows
--
-- 20260930000100 seeded the matrix for admin and super_admin and deliberately
-- left doctor, receptionist, lab and finance_manager empty, because a
-- near-matching key would either describe a role wrongly on the Roles screen
-- or — these permissions being real — quietly widen what it can reach. The
-- Roles screen has said "Defined in the system" for them ever since.
--
-- This fills them in without either failure, by deriving the sets rather than
-- guessing them. A key is granted to a role only when every table and command
-- that key unlocks in 20260930000200_permission_policies.sql is already
-- reachable through that role's own policies. So each row below restates
-- access the role has today; none of them adds any.
--
-- What is deliberately absent is as important as what is here:
--
--   * clinical.view for lab and receptionist. A lab user may update a
--     diagnostic result and a receptionist may read one, but that key also
--     unlocks soap_records, diagnoses and prescriptions. Neither can read
--     those today, and a matrix row is not a reason to let them (CLAUDE.md §3).
--   * billing.manage for finance_manager. They may raise an invoice and record
--     a payment; they may not edit a payment or a refund once recorded, and
--     that key would let them.
--   * notifications.manage for receptionist. They may act on a website
--     enquiry, not rewrite the practice's reminder templates.
--   * reports.view for finance_manager. They see the financial reports, but
--     that key reads as clinical reporting too, which is is_report_viewer's,
--     not theirs.
--   * client, still empty. A client's access is their own records —
--     owns_client() — not a permission the practice grants.
--
-- The three narrower roles keep reaching their areas of /admin by role, as
-- they always have. src/features/auth/access.ts is changed in step with this
-- so that the permission fallback beside those role checks stays what it was
-- written to be: the way a practice's OWN roles reach a page. Without that,
-- these rows would open the admin area to every doctor.
-- ---------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_key)
select r.id, grant_row.permission_key
from (values
  -- Doctor: the clinical desk. Authorship of SOAP notes and prescriptions is
  -- theirs through their own policies and has no key in the catalogue at all
  -- (CLAUDE.md §11); clinical.view here is the reading half.
  ('doctor',          'appointments.view'),
  ('doctor',          'appointments.manage'),
  ('doctor',          'clients.view'),
  ('doctor',          'clients.manage'),
  ('doctor',          'patients.view'),
  ('doctor',          'patients.manage'),
  ('doctor',          'clinical.view'),
  ('doctor',          'billing.view'),

  -- Receptionist: the front desk. Books and moves appointments; reads
  -- everything else it needs to answer the phone.
  ('receptionist',    'appointments.view'),
  ('receptionist',    'appointments.manage'),
  ('receptionist',    'clients.view'),
  ('receptionist',    'patients.view'),
  ('receptionist',    'preventive.view'),
  ('receptionist',    'services.view'),
  ('receptionist',    'doctors.view'),
  ('receptionist',    'notifications.view'),

  -- Finance manager: the money, read where it is written elsewhere.
  ('finance_manager', 'appointments.view'),
  ('finance_manager', 'clients.view'),
  ('finance_manager', 'services.view'),
  ('finance_manager', 'billing.view'),

  -- Lab: deliberately the shortest list on the screen. Updating a diagnostic
  -- result is what a lab user does, and the catalogue has no key for it —
  -- clinical is view-only, and its view is wider than they hold.
  ('lab',             'appointments.view'),
  ('lab',             'clients.view'),
  ('lab',             'patients.view')
) as grant_row (role_slug, permission_key)
join public.roles r on r.slug = grant_row.role_slug and r.is_system
on conflict (role_id, permission_key) do nothing;
