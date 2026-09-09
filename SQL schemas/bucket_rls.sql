-- ================================================================
-- SUPABASE STORAGE POLICIES FOR 'research-documents'
-- ================================================================

-- 1. Allow authenticated users (Faculty & Admin) to upload PDF documents
create policy "Allow authenticated uploads"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'research-documents'
);

-- 2. Allow authenticated users to view/download PDF documents
create policy "Allow authenticated downloads"
on storage.objects for select
to authenticated
using (
    bucket_id = 'research-documents'
);

-- 3. Allow owner or admin to update/overwrite files in research-documents
drop policy if exists "Allow authenticated updates" on storage.objects;
drop policy if exists "Allow owner or admin update storage objects" on storage.objects;
create policy "Allow owner or admin update storage objects"
on storage.objects for update
to authenticated
using (
    bucket_id = 'research-documents'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    )
);

-- 4. Allow owner or admin to delete files in research-documents
drop policy if exists "Allow authenticated deletes" on storage.objects;
drop policy if exists "Allow owner or admin delete storage objects" on storage.objects;
create policy "Allow owner or admin delete storage objects"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'research-documents'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    )
);
