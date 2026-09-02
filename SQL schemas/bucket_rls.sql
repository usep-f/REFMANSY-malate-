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

-- 3. Allow users to update/overwrite files in research-documents
create policy "Allow authenticated updates"
on storage.objects for update
to authenticated
using (
    bucket_id = 'research-documents'
);

-- 4. Allow users/admins to delete files in research-documents
create policy "Allow authenticated deletes"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'research-documents'
);
