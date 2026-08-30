-- ---------------------------------------------------------------------------
-- Teaching row level security to read the permission matrix
--
-- 20260930000100 made permissions data. On its own that changes nothing: the
-- policies still ask which of seven slugs you hold, so a custom role with
-- every box ticked would still read nothing. This migration adds, beside each
-- existing policy, one that asks the matrix instead.
--
-- Additive by construction, the same reasoning as 20260917000100_staff_roles:
-- Postgres OR's permissive policies for the same command together, so a new
-- policy can only widen. Which is precisely why the built-in roles other than
-- admin hold no permissions at all (see the previous migration): a policy here
-- that matched a seeded key would have handed a receptionist or a lab user
-- access they did not have before, in the name of describing them.
--
-- Shape, everywhere:
--   organization_id in (select public.my_permission_org_ids('module.action'))
-- which Postgres evaluates once per statement, not once per row.
--
-- DELETE is never granted here. Most of these tables have no DELETE privilege
-- granted to `authenticated` at all, and clinical records are soft-deleted
-- (CLAUDE.md §6); a policy cannot re-open a door the GRANT keeps shut, and
-- writing `for all` would have been the way to do it by accident.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The repetitive part, written once.
--
-- A DO block rather than 60 hand-written policies: the pattern is identical
-- for every table that carries organization_id, and three lines of SQL copied
-- twenty times is three lines of SQL that will disagree with itself within a
-- year. The child tables that reach their practice through a parent are
-- written out by hand below, because those genuinely differ.
-- ---------------------------------------------------------------------------

do $$
declare
  entry record;
begin
  for entry in
    select *
    from (values
      -- table,                     module
      ('appointments',              'appointments'),
      ('clients',                   'clients'),
      ('pets',                      'patients'),
      ('documents',                 'patients'),
      -- Clinical records and the doses recorded against a schedule get a read
      -- policy and no write one — see the condition in the loop below.
      ('soap_records',              'clinical'),
      ('diagnoses',                 'clinical'),
      ('prescriptions',             'clinical'),
      ('diagnostics',               'clinical'),
      ('vaccinations',              'preventive'),
      ('deworming_records',         'preventive'),
      ('vaccination_schedules',     'preventive'),
      ('invoices',                  'billing'),
      ('payments',                  'billing'),
      ('refunds',                   'billing'),
      ('services',                  'services'),
      ('service_categories',        'services'),
      ('doctors',                   'doctors'),
      ('doctor_availability',       'doctors'),
      ('notifications',             'notifications'),
      ('notification_templates',    'notifications'),
      ('contact_messages',          'notifications'),
      ('site_pages',                'website'),
      ('site_content',              'website'),
      ('page_section_items',        'website'),
      ('nav_menu_items',            'website'),
      ('organization_hero_images',  'website'),
      ('branches',                  'settings'),
      ('user_roles',                'team'),
      ('staff',                     'team')
    ) as t(table_name, module)
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (organization_id in (select public.my_permission_org_ids(%L)))',
      entry.table_name || '_select_by_permission', entry.table_name, entry.module || '.view');

    -- Three kinds of table get a select policy and no more:
    --   team — granting roles is administrator work and is not delegable;
    --   clinical records — authorship is the attending vet's (CLAUDE.md §11);
    --   vaccinations and deworming — recording a dose is authorship too, while
    --   the schedules behind them are ordinary practice configuration.
    if entry.module <> 'team'
       and entry.module <> 'clinical'
       and entry.table_name not in ('vaccinations', 'deworming_records') then
      execute format(
        'create policy %I on public.%I for insert to authenticated
           with check (organization_id in (select public.my_permission_org_ids(%L)))',
        entry.table_name || '_insert_by_permission', entry.table_name, entry.module || '.manage');

      execute format(
        'create policy %I on public.%I for update to authenticated
           using (organization_id in (select public.my_permission_org_ids(%L)))
           with check (organization_id in (select public.my_permission_org_ids(%L)))',
        entry.table_name || '_update_by_permission', entry.table_name,
        entry.module || '.manage', entry.module || '.manage');
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Append-only tables: reading only. data_exports and data_imports refuse
-- UPDATE and DELETE by trigger for every role, so a write policy here would be
-- a policy that can never be satisfied.
-- ---------------------------------------------------------------------------

create policy data_exports_select_by_permission on public.data_exports
  for select to authenticated
  using (organization_id in (select public.my_permission_org_ids('data.view')));

create policy data_imports_select_by_permission on public.data_imports
  for select to authenticated
  using (organization_id in (select public.my_permission_org_ids('data.view')));

create policy audit_logs_select_by_permission on public.audit_logs
  for select to authenticated
  using (organization_id in (select public.my_permission_org_ids('data.view')));

-- Taking a backup writes a data_exports row as the person taking it, so
-- data.manage needs to be able to add one — matching data_exports_insert.
create policy data_exports_insert_by_permission on public.data_exports
  for insert to authenticated
  with check (
    organization_id in (select public.my_permission_org_ids('data.manage'))
    and actor_user_id = (select auth.uid())
  );

create policy data_imports_insert_by_permission on public.data_imports
  for insert to authenticated
  with check (
    organization_id in (select public.my_permission_org_ids('data.manage'))
    and actor_user_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- The practice itself. organizations has no organization_id; its own id is it.
-- ---------------------------------------------------------------------------

create policy organizations_select_by_permission on public.organizations
  for select to authenticated
  using (id in (select public.my_permission_org_ids('settings.view')));

create policy organizations_update_by_permission on public.organizations
  for update to authenticated
  using (id in (select public.my_permission_org_ids('settings.manage')))
  with check (id in (select public.my_permission_org_ids('settings.manage')));

-- ---------------------------------------------------------------------------
-- Children, which reach their practice through a parent. Same question, one
-- join further out — the shape their existing policies already use.
-- ---------------------------------------------------------------------------

create policy invoice_items_select_by_permission on public.invoice_items
  for select to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.organization_id in (select public.my_permission_org_ids('billing.view'))
    )
  );

create policy invoice_items_insert_by_permission on public.invoice_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.organization_id in (select public.my_permission_org_ids('billing.manage'))
    )
  );

create policy invoice_items_update_by_permission on public.invoice_items
  for update to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.organization_id in (select public.my_permission_org_ids('billing.manage'))
    )
  )
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.organization_id in (select public.my_permission_org_ids('billing.manage'))
    )
  );

-- Read-only for the same reason as its parent: a prescription's lines are the
-- prescription.
create policy prescription_items_select_by_permission on public.prescription_items
  for select to authenticated
  using (
    exists (
      select 1 from public.prescriptions rx
      where rx.id = prescription_items.prescription_id
        and rx.organization_id in (select public.my_permission_org_ids('clinical.view'))
    )
  );

create policy notification_logs_select_by_permission on public.notification_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.notifications n
      where n.id = notification_logs.notification_id
        and n.organization_id in (select public.my_permission_org_ids('notifications.view'))
    )
  );

create policy site_page_blocks_select_by_permission on public.site_page_blocks
  for select to authenticated
  using (
    exists (
      select 1 from public.site_pages sp
      where sp.id = site_page_blocks.page_id
        and sp.organization_id in (select public.my_permission_org_ids('website.view'))
    )
  );

create policy site_page_blocks_insert_by_permission on public.site_page_blocks
  for insert to authenticated
  with check (
    exists (
      select 1 from public.site_pages sp
      where sp.id = site_page_blocks.page_id
        and sp.organization_id in (select public.my_permission_org_ids('website.manage'))
    )
  );

create policy site_page_blocks_update_by_permission on public.site_page_blocks
  for update to authenticated
  using (
    exists (
      select 1 from public.site_pages sp
      where sp.id = site_page_blocks.page_id
        and sp.organization_id in (select public.my_permission_org_ids('website.manage'))
    )
  )
  with check (
    exists (
      select 1 from public.site_pages sp
      where sp.id = site_page_blocks.page_id
        and sp.organization_id in (select public.my_permission_org_ids('website.manage'))
    )
  );

-- ---------------------------------------------------------------------------
-- People. users carries no organization_id — someone belongs to a practice by
-- holding a role in it, which is what team.view is for. Read only: creating
-- and deactivating logins stays administrator work.
-- ---------------------------------------------------------------------------

create policy users_select_by_permission on public.users
  for select to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = users.id
        and ur.revoked_at is null
        and ur.organization_id in (select public.my_permission_org_ids('team.view'))
    )
  );

-- ---------------------------------------------------------------------------
-- Reference data every clinic-side screen needs to render a record at all:
-- species and breed names, the medication formulary, appointment statuses.
-- Already readable by any signed-in user; nothing to add. Left here as a note
-- so the absence looks deliberate rather than forgotten.
-- ---------------------------------------------------------------------------
