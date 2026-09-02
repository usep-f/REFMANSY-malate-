-- ================================================================
-- REFMANSY: QR Code System RLS & Storage Access Policies
-- Allows anonymous mobile users scanning hard-copy QR codes to:
-- 1. View metadata of 'approved' research files
-- 2. Log anonymous scan download records
-- 3. Download soft-copy documents from the 'research-documents' bucket
-- ================================================================

-- 1. Allow anonymous users to view approved research files only
drop policy if exists "Allow anon select approved research" on public.research_files;
create policy "Allow anon select approved research"
on public.research_files
for select
to anon
using (
    status = 'approved'
);

-- 2. Allow anonymous users to insert download audit records (QR Guest scans)
drop policy if exists "Allow anon insert download records" on public.download_records;
create policy "Allow anon insert download records"
on public.download_records
for insert
to anon
with check (
    true
);

-- 3. Allow anonymous users to read/download documents from storage bucket
drop policy if exists "Allow anon download research documents" on storage.objects;
create policy "Allow anon download research documents"
on storage.objects
for select
to anon
using (
    bucket_id = 'research-documents'
);
