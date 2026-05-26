-- 0008_drop_seed_group_auto_join.sql
--
-- Removes the handle_new_user() auth trigger introduced in 0003. New sign-ups
-- now land in zero groups; users either create one (`/groups/new`,
-- create_group RPC) or join via an invite (`/join/[code]`, accept_invite RPC).
-- The /  redirector in web/src/app/page.tsx already forwards membership-free
-- accounts to /groups/new.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
