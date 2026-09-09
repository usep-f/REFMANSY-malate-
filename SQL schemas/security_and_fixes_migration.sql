-- ================================================================
-- REFMANSY: Security Hardening & Bug Fixes Migration
-- Run this script in your Supabase SQL Editor
-- ================================================================

-- 1. Fix RLS on research_files to allow faculty to edit REJECTED submissions
-- (Previously restricted to 'pending' only, blocking faculty from fixing rejected papers)
drop policy if exists "Allow faculty update own pending research" on public.research_files;
drop policy if exists "Allow faculty update own pending or rejected research" on public.research_files;

create policy "Allow faculty update own pending or rejected research"
on public.research_files
for update
to authenticated
using (
    (owner_id = auth.uid() and status in ('pending', 'rejected'))
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
)
with check (
    (owner_id = auth.uid() and status in ('pending', 'rejected'))
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- 2. Prevent Privilege Escalation on profiles table
-- (Users can update their own full_name, username, etc., but CANNOT change their role or status)
drop policy if exists "Allow user update self" on public.profiles;

create policy "Allow user update self"
on public.profiles
for update
to authenticated
using (
    auth.uid() = id
)
with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and status = (select p.status from public.profiles p where p.id = auth.uid())
);

-- 3. Add explicit insert policy for profiles
-- (Permits client-side fallback upsert on user registration if trigger is delayed)
drop policy if exists "Allow insert own profile" on public.profiles;

create policy "Allow insert own profile"
on public.profiles
for insert
to authenticated
with check (
    auth.uid() = id
);

-- 4. Secure Storage Object Deletion in 'research-documents' bucket
-- (Only document owners or admins may delete documents; prevents cross-user document deletion)
drop policy if exists "Allow authenticated deletes" on storage.objects;
drop policy if exists "Allow owner or admin delete storage objects" on storage.objects;

create policy "Allow owner or admin delete storage objects"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'research-documents'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    )
);

-- 5. Secure Storage Object Update in 'research-documents' bucket
drop policy if exists "Allow authenticated updates" on storage.objects;
drop policy if exists "Allow owner or admin update storage objects" on storage.objects;

create policy "Allow owner or admin update storage objects"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'research-documents'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    )
);

-- ----------------------------------------------------------------
-- 6. User Management Helper & Permanent Deletion RPC
-- ----------------------------------------------------------------
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

drop policy if exists "Allow admin update profiles" on public.profiles;
create policy "Allow admin update profiles" on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Allow admin delete profiles" on public.profiles;
create policy "Allow admin delete profiles" on public.profiles
for delete to authenticated
using (public.is_admin());

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied: Only administrators can delete user accounts.';
  end if;

  if auth.uid() = target_user_id then
    raise exception 'Self-deletion is not permitted. An admin cannot delete their own account.';
  end if;

  delete from auth.users where id = target_user_id;
  delete from public.profiles where id = target_user_id;
end;
$$;

revoke execute on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ----------------------------------------------------------------
-- 7. Feedback System: Columns & Admin Deletion Policy
-- ----------------------------------------------------------------
alter table public.feedback 
    add column if not exists type text not null default 'general';

alter table public.feedback 
    add column if not exists admin_id uuid references public.profiles(id) on delete set null;

alter table public.feedback 
    add column if not exists admin_name text;

update public.feedback 
set status = 'in_progress' 
where status = 'in-progress';

do $$
begin
    if not exists (
        select 1 from pg_policies 
        where tablename = 'feedback' 
        and policyname = 'Allow admin delete feedback'
    ) then
        create policy "Allow admin delete feedback" on public.feedback 
        for delete to authenticated 
        using (
            exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
        );
    end if;
end
$$;

-- ----------------------------------------------------------------
-- 8. QR Code Physical Hard-Copy Scanning Policies
-- ----------------------------------------------------------------
drop policy if exists "Allow anon select approved research" on public.research_files;
create policy "Allow anon select approved research"
on public.research_files
for select
to anon
using (
    status = 'approved'
);

drop policy if exists "Allow anon insert download records" on public.download_records;
create policy "Allow anon insert download records"
on public.download_records
for insert
to anon
with check (
    true
);

drop policy if exists "Allow anon download research documents" on storage.objects;
create policy "Allow anon download research documents"
on storage.objects
for select
to anon
using (
    bucket_id = 'research-documents'
);
