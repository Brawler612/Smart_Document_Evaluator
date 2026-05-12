-- Adds an avatar_url column to public.users so the Google profile picture
-- captured during OAuth sign-in can be persisted and shown to other users
-- (e.g. teachers viewing student rows).
--
-- Safe to run multiple times: uses IF NOT EXISTS guards.
--
-- Apply from a trusted machine (psql or Supabase SQL Editor):
--   - With DATABASE_URL in .env:  npm run db:apply -- docs/supabase-add-users-avatar-url.sql
--   - Or paste into Supabase Dashboard → SQL Editor → Run.

alter table public.users
  add column if not exists avatar_url text;

comment on column public.users.avatar_url is
  'Profile picture URL from the OAuth provider (e.g. Google `picture` claim). Synced on every sign-in by the client AuthContext.';

-- Optional: backfill avatar_url for users who already signed in once, by
-- copying it out of auth.users.raw_user_meta_data. The client will also
-- overwrite this on the next sign-in, so backfill is not strictly required.
update public.users pu
   set avatar_url = au.raw_user_meta_data->>'picture'
  from auth.users au
 where pu.id = au.id
   and pu.avatar_url is null
   and au.raw_user_meta_data->>'picture' is not null;
