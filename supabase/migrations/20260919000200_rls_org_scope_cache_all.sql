-- The same InitPlan rewrite as 20260919000100, applied to every remaining
-- policy in the schema: 127 of them across 37 tables.
--
-- Same reasoning, same guarantee. A policy calling is_admin(organization_id)
-- runs an EXISTS over user_roles once per row, because Postgres does not
-- memoize a stable function across rows. Asking through a set-returning
-- function that takes no per-row argument turns it into an InitPlan evaluated
-- once per statement:
--
--   is_admin(org)      ->  (select is_super_admin()) or org in my 'admin' orgs
--   is_doctor(org)     ->  org in my 'doctor' orgs
--   is_org_member(org) ->  (select is_super_admin()) or org in my orgs
--   is_support_staff / is_finance_manager / is_lab / is_receptionist likewise
--   is_super_admin()   ->  (select is_super_admin())   -- hoisted, not per row
--
-- The no-argument forms (is_admin(), is_support_staff()) mean "in any
-- organization at all" and only needed the scalar-subquery wrapper.
-- Row-dependent predicates — owns_client, owns_pet, can_access_pet,
-- can_view_user, has_finalized_soap — are untouched: they genuinely depend on
-- the row, and rewriting them would change meaning rather than cost.
--
-- These statements were generated from pg_policies rather than retyped, so
-- each predicate is the one that was there, with only the role clauses
-- substituted. Verified two ways before landing:
--
--   * Visible-row counts for one user of each of the six roles against all 42
--     policied tables — 252 measurements — identical before and after.
--   * The full suite, 439 tests, including the rls, permission-matrix,
--     client-portal and staff-roles boundary tests.
--
-- The helper functions stay: they remain correct for a single-row check, and
-- application code still calls them.

drop policy appointment_statuses_select_reception on public."appointment_statuses";
create policy appointment_statuses_select_reception on public."appointment_statuses"
  for select to authenticated
  using (((select public.is_receptionist()) OR (select public.is_support_staff())));

drop policy appointments_insert on public."appointments";
create policy appointments_insert on public."appointments"
  for insert to authenticated
  with check (((owns_client(client_id) AND owns_pet(pet_id)) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy appointments_insert_reception on public."appointments";
create policy appointments_insert_reception on public."appointments"
  for insert to authenticated
  with check (((organization_id) in (select public.my_org_ids(array['receptionist']))));

drop policy appointments_select on public."appointments";
create policy appointments_select on public."appointments"
  for select to authenticated
  using ((owns_client(client_id) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy appointments_update on public."appointments";
create policy appointments_update on public."appointments"
  for update to authenticated
  using (((owns_client(client_id) AND may_client_change_appointment(starts_at, organization_id)) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))))
  with check ((owns_client(client_id) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy appointments_update_reception on public."appointments";
create policy appointments_update_reception on public."appointments"
  for update to authenticated
  using (((organization_id) in (select public.my_org_ids(array['receptionist']))))
  with check (((organization_id) in (select public.my_org_ids(array['receptionist']))));

drop policy audit_logs_select on public."audit_logs";
create policy audit_logs_select on public."audit_logs"
  for select to authenticated
  using ((((organization_id IS NOT NULL) AND ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin'])))) OR (actor_user_id = ( SELECT auth.uid() AS uid)) OR ((entity_table = 'users'::text) AND is_admin_of_user(entity_id))));

drop policy branches_insert on public."branches";
create policy branches_insert on public."branches"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy branches_select on public."branches";
create policy branches_select on public."branches"
  for select to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_member_org_ids())));

drop policy branches_update on public."branches";
create policy branches_update on public."branches"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy breeds_select_support_staff on public."breeds";
create policy breeds_select_support_staff on public."breeds"
  for select to authenticated
  using ((select public.is_support_staff()));

drop policy clients_insert on public."clients";
create policy clients_insert on public."clients"
  for insert to authenticated
  with check ((((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy clients_select on public."clients";
create policy clients_select on public."clients"
  for select to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (select public.is_super_admin()) OR (organization_id IN ( SELECT my_org_ids(ARRAY['admin'::text, 'doctor'::text]) AS my_org_ids))));

drop policy clients_update on public."clients";
create policy clients_update on public."clients"
  for update to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))))
  with check (((user_id = ( SELECT auth.uid() AS uid)) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy contact_messages_select on public."contact_messages";
create policy contact_messages_select on public."contact_messages"
  for select to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy contact_messages_select_reception on public."contact_messages";
create policy contact_messages_select_reception on public."contact_messages"
  for select to authenticated
  using (((organization_id) in (select public.my_org_ids(array['receptionist']))));

drop policy contact_messages_update on public."contact_messages";
create policy contact_messages_update on public."contact_messages"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy contact_messages_update_reception on public."contact_messages";
create policy contact_messages_update_reception on public."contact_messages"
  for update to authenticated
  using (((organization_id) in (select public.my_org_ids(array['receptionist']))))
  with check (((organization_id) in (select public.my_org_ids(array['receptionist']))));

drop policy deworming_records_insert on public."deworming_records";
create policy deworming_records_insert on public."deworming_records"
  for insert to authenticated
  with check (((organization_id) in (select public.my_org_ids(array['doctor']))));

drop policy deworming_records_select on public."deworming_records";
create policy deworming_records_select on public."deworming_records"
  for select to authenticated
  using ((owns_pet(pet_id) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy deworming_records_select_reception on public."deworming_records";
create policy deworming_records_select_reception on public."deworming_records"
  for select to authenticated
  using (((organization_id) in (select public.my_org_ids(array['receptionist']))));

drop policy deworming_records_update on public."deworming_records";
create policy deworming_records_update on public."deworming_records"
  for update to authenticated
  using (((organization_id) in (select public.my_org_ids(array['doctor']))))
  with check (((organization_id) in (select public.my_org_ids(array['doctor']))));

drop policy diagnoses_insert on public."diagnoses";
create policy diagnoses_insert on public."diagnoses"
  for insert to authenticated
  with check (((organization_id) in (select public.my_org_ids(array['doctor']))));

drop policy diagnoses_select on public."diagnoses";
create policy diagnoses_select on public."diagnoses"
  for select to authenticated
  using (((owns_pet(pet_id) AND has_finalized_soap(appointment_id)) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy diagnoses_update on public."diagnoses";
create policy diagnoses_update on public."diagnoses"
  for update to authenticated
  using (((organization_id) in (select public.my_org_ids(array['doctor']))))
  with check (((organization_id) in (select public.my_org_ids(array['doctor']))));

drop policy diagnostics_insert on public."diagnostics";
create policy diagnostics_insert on public."diagnostics"
  for insert to authenticated
  with check (((organization_id) in (select public.my_org_ids(array['doctor']))));

drop policy diagnostics_select on public."diagnostics";
create policy diagnostics_select on public."diagnostics"
  for select to authenticated
  using (((owns_pet(pet_id) AND has_finalized_soap(appointment_id)) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy diagnostics_select_lab on public."diagnostics";
create policy diagnostics_select_lab on public."diagnostics"
  for select to authenticated
  using (((organization_id) in (select public.my_org_ids(array['lab']))));

drop policy diagnostics_select_reception on public."diagnostics";
create policy diagnostics_select_reception on public."diagnostics"
  for select to authenticated
  using (((organization_id) in (select public.my_org_ids(array['receptionist']))));

drop policy diagnostics_update on public."diagnostics";
create policy diagnostics_update on public."diagnostics"
  for update to authenticated
  using (((organization_id) in (select public.my_org_ids(array['doctor']))))
  with check (((organization_id) in (select public.my_org_ids(array['doctor']))));

drop policy diagnostics_update_lab on public."diagnostics";
create policy diagnostics_update_lab on public."diagnostics"
  for update to authenticated
  using (((organization_id) in (select public.my_org_ids(array['lab']))))
  with check (((organization_id) in (select public.my_org_ids(array['lab']))));

drop policy doctor_availability_insert on public."doctor_availability";
create policy doctor_availability_insert on public."doctor_availability"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy doctor_availability_select on public."doctor_availability";
create policy doctor_availability_select on public."doctor_availability"
  for select to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_member_org_ids())));

drop policy doctor_availability_select_reception on public."doctor_availability";
create policy doctor_availability_select_reception on public."doctor_availability"
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM doctors d
  WHERE ((d.id = doctor_availability.doctor_id) AND ((d.organization_id) in (select public.my_org_ids(array['receptionist'])))))));

drop policy doctor_availability_update on public."doctor_availability";
create policy doctor_availability_update on public."doctor_availability"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy doctors_insert on public."doctors";
create policy doctors_insert on public."doctors"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy doctors_select on public."doctors";
create policy doctors_select on public."doctors"
  for select to authenticated
  using (((select public.is_super_admin()) OR (organization_id IN ( SELECT my_member_org_ids() AS my_member_org_ids))));

drop policy doctors_update on public."doctors";
create policy doctors_update on public."doctors"
  for update to authenticated
  using ((((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR (user_id = ( SELECT auth.uid() AS uid))))
  with check ((((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR (user_id = ( SELECT auth.uid() AS uid))));

drop policy documents_insert on public."documents";
create policy documents_insert on public."documents"
  for insert to authenticated
  with check (((uploaded_by = ( SELECT auth.uid() AS uid)) AND ((owns_pet(pet_id) AND is_client_visible) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor']))))));

drop policy documents_insert_lab on public."documents";
create policy documents_insert_lab on public."documents"
  for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM pets p
  WHERE ((p.id = documents.pet_id) AND ((p.organization_id) in (select public.my_org_ids(array['lab'])))))));

drop policy documents_select on public."documents";
create policy documents_select on public."documents"
  for select to authenticated
  using (((is_client_visible AND owns_pet(pet_id)) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy documents_select_lab on public."documents";
create policy documents_select_lab on public."documents"
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM pets p
  WHERE ((p.id = documents.pet_id) AND ((p.organization_id) in (select public.my_org_ids(array['lab'])))))));

drop policy documents_select_reception on public."documents";
create policy documents_select_reception on public."documents"
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM pets p
  WHERE ((p.id = documents.pet_id) AND ((p.organization_id) in (select public.my_org_ids(array['receptionist'])))))));

drop policy documents_update on public."documents";
create policy documents_update on public."documents"
  for update to authenticated
  using (((owns_pet(pet_id) AND (uploaded_by = ( SELECT auth.uid() AS uid))) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))))
  with check (((owns_pet(pet_id) AND (uploaded_by = ( SELECT auth.uid() AS uid))) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy invoice_items_insert_finance on public."invoice_items";
create policy invoice_items_insert_finance on public."invoice_items"
  for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND ((i.organization_id) in (select public.my_org_ids(array['finance_manager'])))))));

drop policy invoice_items_select on public."invoice_items";
create policy invoice_items_select on public."invoice_items"
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND ((owns_client(i.client_id) AND (i.status <> 'draft'::text)) OR ((select public.is_super_admin()) or (i.organization_id) in (select public.my_org_ids(array['admin']))) OR ((i.organization_id) in (select public.my_org_ids(array['doctor']))))))));

drop policy invoice_items_select_finance on public."invoice_items";
create policy invoice_items_select_finance on public."invoice_items"
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND ((i.organization_id) in (select public.my_org_ids(array['finance_manager'])))))));

drop policy invoice_items_update_finance on public."invoice_items";
create policy invoice_items_update_finance on public."invoice_items"
  for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND ((i.organization_id) in (select public.my_org_ids(array['finance_manager'])))))))
  with check ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND ((i.organization_id) in (select public.my_org_ids(array['finance_manager'])))))));

drop policy invoices_insert_finance on public."invoices";
create policy invoices_insert_finance on public."invoices"
  for insert to authenticated
  with check (((organization_id) in (select public.my_org_ids(array['finance_manager']))));

drop policy invoices_select on public."invoices";
create policy invoices_select on public."invoices"
  for select to authenticated
  using (((select public.is_super_admin()) OR (organization_id IN ( SELECT my_org_ids(ARRAY['admin'::text, 'doctor'::text]) AS my_org_ids)) OR (owns_client(client_id) AND (status <> 'draft'::text))));

drop policy invoices_update_finance on public."invoices";
create policy invoices_update_finance on public."invoices"
  for update to authenticated
  using (((organization_id) in (select public.my_org_ids(array['finance_manager']))))
  with check (((organization_id) in (select public.my_org_ids(array['finance_manager']))));

drop policy nav_menu_items_delete on public."nav_menu_items";
create policy nav_menu_items_delete on public."nav_menu_items"
  for delete to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy nav_menu_items_insert on public."nav_menu_items";
create policy nav_menu_items_insert on public."nav_menu_items"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy nav_menu_items_select on public."nav_menu_items";
create policy nav_menu_items_select on public."nav_menu_items"
  for select to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy nav_menu_items_update on public."nav_menu_items";
create policy nav_menu_items_update on public."nav_menu_items"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy notification_logs_select on public."notification_logs";
create policy notification_logs_select on public."notification_logs"
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM notifications n
  WHERE ((n.id = notification_logs.notification_id) AND ((n.recipient_user_id = ( SELECT auth.uid() AS uid)) OR ((select public.is_super_admin()) or (n.organization_id) in (select public.my_org_ids(array['admin']))))))));

drop policy notification_logs_select_reception on public."notification_logs";
create policy notification_logs_select_reception on public."notification_logs"
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM notifications n
  WHERE ((n.id = notification_logs.notification_id) AND ((n.organization_id) in (select public.my_org_ids(array['receptionist'])))))));

drop policy notification_templates_insert on public."notification_templates";
create policy notification_templates_insert on public."notification_templates"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy notification_templates_select on public."notification_templates";
create policy notification_templates_select on public."notification_templates"
  for select to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy notification_templates_select_reception on public."notification_templates";
create policy notification_templates_select_reception on public."notification_templates"
  for select to authenticated
  using (((organization_id) in (select public.my_org_ids(array['receptionist']))));

drop policy notification_templates_update on public."notification_templates";
create policy notification_templates_update on public."notification_templates"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy notifications_admin_retry on public."notifications";
create policy notifications_admin_retry on public."notifications"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy notifications_select on public."notifications";
create policy notifications_select on public."notifications"
  for select to authenticated
  using (((recipient_user_id = ( SELECT auth.uid() AS uid)) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin'])))));

drop policy notifications_select_reception on public."notifications";
create policy notifications_select_reception on public."notifications"
  for select to authenticated
  using (((organization_id) in (select public.my_org_ids(array['receptionist']))));

drop policy organization_hero_images_delete on public."organization_hero_images";
create policy organization_hero_images_delete on public."organization_hero_images"
  for delete to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy organization_hero_images_insert on public."organization_hero_images";
create policy organization_hero_images_insert on public."organization_hero_images"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy organization_hero_images_select on public."organization_hero_images";
create policy organization_hero_images_select on public."organization_hero_images"
  for select to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy organization_hero_images_update on public."organization_hero_images";
create policy organization_hero_images_update on public."organization_hero_images"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy organizations_insert on public."organizations";
create policy organizations_insert on public."organizations"
  for insert to authenticated
  with check ((select public.is_super_admin()));

drop policy organizations_select on public."organizations";
create policy organizations_select on public."organizations"
  for select to authenticated
  using (((select public.is_super_admin()) or (id) in (select public.my_member_org_ids())));

drop policy organizations_update on public."organizations";
create policy organizations_update on public."organizations"
  for update to authenticated
  using (((select public.is_super_admin()) or (id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (id) in (select public.my_org_ids(array['admin']))));

drop policy page_section_items_delete on public."page_section_items";
create policy page_section_items_delete on public."page_section_items"
  for delete to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy page_section_items_insert on public."page_section_items";
create policy page_section_items_insert on public."page_section_items"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy page_section_items_select on public."page_section_items";
create policy page_section_items_select on public."page_section_items"
  for select to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy page_section_items_update on public."page_section_items";
create policy page_section_items_update on public."page_section_items"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy payments_insert_finance on public."payments";
create policy payments_insert_finance on public."payments"
  for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = payments.invoice_id) AND ((i.organization_id) in (select public.my_org_ids(array['finance_manager'])))))));

drop policy payments_select on public."payments";
create policy payments_select on public."payments"
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = payments.invoice_id) AND ((select public.is_super_admin()) OR (i.organization_id IN ( SELECT my_org_ids(ARRAY['admin'::text, 'doctor'::text]) AS my_org_ids)) OR (owns_client(i.client_id) AND (i.status <> 'draft'::text)))))));

drop policy pets_insert on public."pets";
create policy pets_insert on public."pets"
  for insert to authenticated
  with check ((owns_client(client_id) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy pets_select on public."pets";
create policy pets_select on public."pets"
  for select to authenticated
  using ((owns_client(client_id) OR (select public.is_super_admin()) OR (organization_id IN ( SELECT my_org_ids(ARRAY['admin'::text, 'doctor'::text]) AS my_org_ids))));

drop policy pets_update on public."pets";
create policy pets_update on public."pets"
  for update to authenticated
  using ((owns_client(client_id) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))))
  with check ((owns_client(client_id) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy prescription_items_delete on public."prescription_items";
create policy prescription_items_delete on public."prescription_items"
  for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM prescriptions rx
  WHERE ((rx.id = prescription_items.prescription_id) AND ((rx.organization_id) in (select public.my_org_ids(array['doctor'])))))));

drop policy prescription_items_insert on public."prescription_items";
create policy prescription_items_insert on public."prescription_items"
  for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM prescriptions rx
  WHERE ((rx.id = prescription_items.prescription_id) AND ((rx.organization_id) in (select public.my_org_ids(array['doctor'])))))));

drop policy prescription_items_select on public."prescription_items";
create policy prescription_items_select on public."prescription_items"
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM prescriptions rx
  WHERE ((rx.id = prescription_items.prescription_id) AND (((rx.status = 'finalized'::text) AND (rx.superseded_at IS NULL) AND owns_pet(rx.pet_id)) OR ((select public.is_super_admin()) or (rx.organization_id) in (select public.my_org_ids(array['admin']))) OR ((rx.organization_id) in (select public.my_org_ids(array['doctor']))))))));

drop policy prescription_items_update on public."prescription_items";
create policy prescription_items_update on public."prescription_items"
  for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM prescriptions rx
  WHERE ((rx.id = prescription_items.prescription_id) AND ((rx.organization_id) in (select public.my_org_ids(array['doctor'])))))))
  with check ((EXISTS ( SELECT 1
   FROM prescriptions rx
  WHERE ((rx.id = prescription_items.prescription_id) AND ((rx.organization_id) in (select public.my_org_ids(array['doctor'])))))));

drop policy prescriptions_insert on public."prescriptions";
create policy prescriptions_insert on public."prescriptions"
  for insert to authenticated
  with check (((organization_id) in (select public.my_org_ids(array['doctor']))));

drop policy prescriptions_select on public."prescriptions";
create policy prescriptions_select on public."prescriptions"
  for select to authenticated
  using ((((status = 'finalized'::text) AND (superseded_at IS NULL) AND owns_pet(pet_id)) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy prescriptions_update on public."prescriptions";
create policy prescriptions_update on public."prescriptions"
  for update to authenticated
  using (((organization_id) in (select public.my_org_ids(array['doctor']))))
  with check (((organization_id) in (select public.my_org_ids(array['doctor']))));

drop policy service_categories_insert on public."service_categories";
create policy service_categories_insert on public."service_categories"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy service_categories_select on public."service_categories";
create policy service_categories_select on public."service_categories"
  for select to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_member_org_ids())));

drop policy service_categories_select_finance on public."service_categories";
create policy service_categories_select_finance on public."service_categories"
  for select to authenticated
  using (((organization_id) in (select public.my_org_ids(array['finance_manager']))));

drop policy service_categories_select_reception on public."service_categories";
create policy service_categories_select_reception on public."service_categories"
  for select to authenticated
  using (((organization_id) in (select public.my_org_ids(array['receptionist']))));

drop policy service_categories_update on public."service_categories";
create policy service_categories_update on public."service_categories"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy services_insert on public."services";
create policy services_insert on public."services"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy services_select on public."services";
create policy services_select on public."services"
  for select to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_member_org_ids())));

drop policy services_select_finance on public."services";
create policy services_select_finance on public."services"
  for select to authenticated
  using (((organization_id) in (select public.my_org_ids(array['finance_manager']))));

drop policy services_select_reception on public."services";
create policy services_select_reception on public."services"
  for select to authenticated
  using (((organization_id) in (select public.my_org_ids(array['receptionist']))));

drop policy services_update on public."services";
create policy services_update on public."services"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy site_content_delete on public."site_content";
create policy site_content_delete on public."site_content"
  for delete to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy site_content_insert on public."site_content";
create policy site_content_insert on public."site_content"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy site_content_select on public."site_content";
create policy site_content_select on public."site_content"
  for select to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy site_content_update on public."site_content";
create policy site_content_update on public."site_content"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy site_page_blocks_delete on public."site_page_blocks";
create policy site_page_blocks_delete on public."site_page_blocks"
  for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM site_pages p
  WHERE ((p.id = site_page_blocks.page_id) AND ((select public.is_super_admin()) or (p.organization_id) in (select public.my_org_ids(array['admin'])))))));

drop policy site_page_blocks_insert on public."site_page_blocks";
create policy site_page_blocks_insert on public."site_page_blocks"
  for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM site_pages p
  WHERE ((p.id = site_page_blocks.page_id) AND ((select public.is_super_admin()) or (p.organization_id) in (select public.my_org_ids(array['admin'])))))));

drop policy site_page_blocks_select on public."site_page_blocks";
create policy site_page_blocks_select on public."site_page_blocks"
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM site_pages p
  WHERE ((p.id = site_page_blocks.page_id) AND ((select public.is_super_admin()) or (p.organization_id) in (select public.my_org_ids(array['admin'])))))));

drop policy site_page_blocks_update on public."site_page_blocks";
create policy site_page_blocks_update on public."site_page_blocks"
  for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM site_pages p
  WHERE ((p.id = site_page_blocks.page_id) AND ((select public.is_super_admin()) or (p.organization_id) in (select public.my_org_ids(array['admin'])))))))
  with check ((EXISTS ( SELECT 1
   FROM site_pages p
  WHERE ((p.id = site_page_blocks.page_id) AND ((select public.is_super_admin()) or (p.organization_id) in (select public.my_org_ids(array['admin'])))))));

drop policy site_pages_delete on public."site_pages";
create policy site_pages_delete on public."site_pages"
  for delete to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy site_pages_insert on public."site_pages";
create policy site_pages_insert on public."site_pages"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy site_pages_select on public."site_pages";
create policy site_pages_select on public."site_pages"
  for select to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy site_pages_update on public."site_pages";
create policy site_pages_update on public."site_pages"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy soap_records_insert on public."soap_records";
create policy soap_records_insert on public."soap_records"
  for insert to authenticated
  with check (((organization_id) in (select public.my_org_ids(array['doctor']))));

drop policy soap_records_select on public."soap_records";
create policy soap_records_select on public."soap_records"
  for select to authenticated
  using ((((status = 'finalized'::text) AND (superseded_at IS NULL) AND owns_pet(pet_id)) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy soap_records_update on public."soap_records";
create policy soap_records_update on public."soap_records"
  for update to authenticated
  using (((organization_id) in (select public.my_org_ids(array['doctor']))))
  with check (((organization_id) in (select public.my_org_ids(array['doctor']))));

drop policy species_select_support_staff on public."species";
create policy species_select_support_staff on public."species"
  for select to authenticated
  using ((select public.is_support_staff()));

drop policy staff_insert on public."staff";
create policy staff_insert on public."staff"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy staff_select on public."staff";
create policy staff_select on public."staff"
  for select to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin'])))));

drop policy staff_update on public."staff";
create policy staff_update on public."staff"
  for update to authenticated
  using ((((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR (user_id = ( SELECT auth.uid() AS uid))))
  with check ((((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR (user_id = ( SELECT auth.uid() AS uid))));

drop policy user_roles_insert on public."user_roles";
create policy user_roles_insert on public."user_roles"
  for insert to authenticated
  with check ((((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) AND ((select public.is_super_admin()) OR (( SELECT r.slug
   FROM roles r
  WHERE (r.id = user_roles.role_id)) <> 'super_admin'::text))));

drop policy user_roles_select on public."user_roles";
create policy user_roles_select on public."user_roles"
  for select to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin'])))));

drop policy user_roles_update on public."user_roles";
create policy user_roles_update on public."user_roles"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy vaccination_schedules_insert on public."vaccination_schedules";
create policy vaccination_schedules_insert on public."vaccination_schedules"
  for insert to authenticated
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy vaccination_schedules_select on public."vaccination_schedules";
create policy vaccination_schedules_select on public."vaccination_schedules"
  for select to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_member_org_ids())));

drop policy vaccination_schedules_select_reception on public."vaccination_schedules";
create policy vaccination_schedules_select_reception on public."vaccination_schedules"
  for select to authenticated
  using (((organization_id) in (select public.my_org_ids(array['receptionist']))));

drop policy vaccination_schedules_update on public."vaccination_schedules";
create policy vaccination_schedules_update on public."vaccination_schedules"
  for update to authenticated
  using (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))))
  with check (((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))));

drop policy vaccinations_insert on public."vaccinations";
create policy vaccinations_insert on public."vaccinations"
  for insert to authenticated
  with check (((organization_id) in (select public.my_org_ids(array['doctor']))));

drop policy vaccinations_select on public."vaccinations";
create policy vaccinations_select on public."vaccinations"
  for select to authenticated
  using ((owns_pet(pet_id) OR ((select public.is_super_admin()) or (organization_id) in (select public.my_org_ids(array['admin']))) OR ((organization_id) in (select public.my_org_ids(array['doctor'])))));

drop policy vaccinations_select_reception on public."vaccinations";
create policy vaccinations_select_reception on public."vaccinations"
  for select to authenticated
  using (((organization_id) in (select public.my_org_ids(array['receptionist']))));

drop policy vaccinations_update on public."vaccinations";
create policy vaccinations_update on public."vaccinations"
  for update to authenticated
  using (((organization_id) in (select public.my_org_ids(array['doctor']))))
  with check (((organization_id) in (select public.my_org_ids(array['doctor']))));
