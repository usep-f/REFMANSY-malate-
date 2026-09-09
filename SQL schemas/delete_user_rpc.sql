-- ================================================================
-- REFMANSY: Permanent User Deletion RPC & Admin Policies
-- Run this script in your Supabase SQL Editor
-- ================================================================

-- 1. Helper function to check if the current authenticated user is an admin
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$;

-- 2. Allow admins to update user profiles (e.g. role, username, details)
drop policy if exists "Allow admin update profiles" on public.profiles;
create policy "Allow admin update profiles" on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 3. Allow admins to delete profiles directly
drop policy if exists "Allow admin delete profiles" on public.profiles;
create policy "Allow admin delete profiles" on public.profiles
for delete to authenticated
using (public.is_admin());

-- 4. Secure RPC function to delete a user from auth.users and public.profiles
create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Ensure caller is authenticated and an administrator
  if not public.is_admin() then
    raise exception 'Access denied: Only administrators can delete user accounts.';
  end if;

  -- Prevent admin from deleting their own account
  if auth.uid() = target_user_id then
    raise exception 'Self-deletion is not permitted. An admin cannot delete their own account.';
  end if;

  -- Delete from auth.users (cascades automatically to public.profiles via foreign key)
  delete from auth.users where id = target_user_id;

  -- Fallback cleanup in case profile existed without an auth user
  delete from public.profiles where id = target_user_id;
end;
$$;

-- Grant execution to authenticated users
revoke execute on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
