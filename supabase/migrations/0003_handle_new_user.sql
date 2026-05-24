-- 0003_handle_new_user.sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  seed_group uuid;
  v_name text;
  v_initials text;
begin
  select id into seed_group from public.groups where name = 'The Sunday Strategists' limit 1;
  if seed_group is null then return new; end if;

  v_name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));
  v_initials := upper(substring(v_name, 1, 2));

  insert into public.group_members (group_id, user_id, role)
  values (seed_group, new.id, 'member')
  on conflict do nothing;

  insert into public.members (group_id, user_id, display_name, handle, color, initials)
  values (seed_group, new.id, v_name, null, '#4a6b7a', v_initials);

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
