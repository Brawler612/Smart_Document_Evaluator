-- Teachers see other students' submissions only when public.users.role is teacher or admin
-- (RLS uses app_user_is_staff()). If the queue stays empty after students submit:
--
-- 1) Prefer listing every instructor Google email in VITE_TEACHER_EMAILS (.env), restart dev/build, sign out/in.
-- 2) Or run once per teacher email (replace the email):

update public.users
set role = 'teacher'
where lower(email) = lower('teacher.example@gmail.com');

-- Verify:
-- select id, email, role from public.users where lower(email) = lower('teacher.example@gmail.com');
