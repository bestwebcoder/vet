-- Every new table needs its own grants — the blanket "all tables to
-- service_role" in 20260820000100_core_schema.sql only covered tables that
-- existed at that time. Missed in 20260903000100_site_content.sql.

grant select, insert, update, delete on public.site_content to authenticated;
grant all on public.site_content to service_role;
