-- Optional: Teachers may remove a student's public.users profile from the dashboard "Remove student".
-- Auth users remain in Authentication until you delete them in Dashboard → Authentication; this only drops the public profile row.

alter table public.users enable row level security;

grant delete on table public.users to authenticated;

drop policy if exists "users_delete_staff_students" on public.users;
create policy "users_delete_staff_students" on public.users
  for delete to authenticated
  using (
    role = 'student'
    and id <> auth.uid()
    and public.app_user_is_staff()
  );

notify pgrst, 'reload schema';
