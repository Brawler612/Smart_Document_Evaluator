-- Helper for RLS policies: reads public.users WITHOUT re-applying row policies (SECURITY DEFINER).
-- PostgreSQL rejects self-referential SELECTs inside policies on the same table (“infinite recursion”).
-- Run once (Supabase SQL Editor), then recreate policies that used `exists (select … from public.users …)`.

create or replace function public.app_user_is_staff()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  return exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('teacher', 'admin')
  );
end;
$$;

revoke all on function public.app_user_is_staff() from public;
grant execute on function public.app_user_is_staff() to anon;
grant execute on function public.app_user_is_staff() to authenticated;
