-- Create `public.users` table used by the app (`src/context/AuthContext.tsx`).
-- Run in Supabase Dashboard → SQL Editor.
-- The `id` column must match the authenticated user's `auth.uid()`.

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null default 'student',
  created_at timestamptz not null default now()
);

-- Role values must match `src/context/AuthContext.tsx` (teacher / student / admin).
alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('teacher', 'student', 'admin'));

