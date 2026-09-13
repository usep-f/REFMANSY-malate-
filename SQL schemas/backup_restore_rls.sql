-- ================================================================
-- REFMANSY: BACKUP & DISASTER RECOVERY RLS POLICIES & HELPER FUNCTIONS
-- ================================================================

-- 1. Ensure Admin Insert/Delete/Update permissions on profiles
drop policy if exists "Allow admin insert profiles" on public.profiles;
create policy "Allow admin insert profiles" 
on public.profiles 
for insert 
to authenticated 
with check (public.is_admin());

-- 2. Ensure Admin Insert permissions on research_files for restore operations
drop policy if exists "Allow admin insert research files" on public.research_files;
create policy "Allow admin insert research files" 
on public.research_files 
for insert 
to authenticated 
with check (public.is_admin());

-- 3. Ensure Admin Delete/Insert permissions on download_records for restore operations
drop policy if exists "Allow admin delete download records" on public.download_records;
create policy "Allow admin delete download records" 
on public.download_records 
for delete 
to authenticated 
using (public.is_admin());

drop policy if exists "Allow admin insert download records" on public.download_records;
create policy "Allow admin insert download records" 
on public.download_records 
for insert 
to authenticated 
with check (public.is_admin() or user_id = auth.uid());

-- 4. Ensure Admin Delete/Insert permissions on feedback for restore operations
drop policy if exists "Allow admin delete feedback" on public.feedback;
create policy "Allow admin delete feedback" 
on public.feedback 
for delete 
to authenticated 
using (public.is_admin());

drop policy if exists "Allow admin insert feedback" on public.feedback;
create policy "Allow admin insert feedback" 
on public.feedback 
for insert 
to authenticated 
with check (public.is_admin() or user_id = auth.uid());

-- 5. Helper Function to fetch table record counts for backup statistics
create or replace function public.get_system_backup_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_admin() then
    raise exception 'Access denied: Only administrators can view system backup stats.';
  end if;

  select json_build_object(
    'profiles_count', (select count(*) from public.profiles),
    'categories_count', (select count(*) from public.categories),
    'tags_count', (select count(*) from public.tags),
    'research_files_count', (select count(*) from public.research_files),
    'download_records_count', (select count(*) from public.download_records),
    'feedback_count', (select count(*) from public.feedback)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.get_system_backup_stats() from public;
grant execute on function public.get_system_backup_stats() to authenticated;
