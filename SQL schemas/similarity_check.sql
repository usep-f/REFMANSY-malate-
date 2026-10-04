-- ================================================================
-- REFMANSY: DUPLICATION DETECTION (TITLE SIMILARITY & FILE SHA-256 HASH)
-- ================================================================

-- 1. Enable pg_trgm extension for fuzzy trigram similarity matching
create extension if not exists pg_trgm;

-- 2. Add file_hash column for binary SHA-256 checksum duplicate detection
alter table public.research_files 
add column if not exists file_hash text;

-- 3. Create indices for high-performance title similarity & hash matching
create index if not exists idx_research_files_title_trgm 
on public.research_files using gin (title gin_trgm_ops);

create index if not exists idx_research_files_file_hash 
on public.research_files (file_hash);

-- 4. Stored Procedure / RPC for duplicate & similar title detection
create or replace function public.check_title_similarity(
    input_title text,
    similarity_threshold float default 0.75,
    exclude_file_id uuid default null
)
returns table (
    id uuid,
    title text,
    researcher text,
    category text,
    publication_year text,
    status text,
    similarity_score float
)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    select 
        rf.id,
        rf.title,
        rf.researcher,
        rf.category,
        rf.publication_year,
        rf.status,
        round(similarity(lower(trim(rf.title)), lower(trim(input_title)))::numeric, 2)::float as similarity_score
    from public.research_files rf
    where 
        (exclude_file_id is null or rf.id <> exclude_file_id)
        and (
            -- Exact case-insensitive match or Trigram similarity threshold
            lower(trim(rf.title)) = lower(trim(input_title))
            or similarity(lower(trim(rf.title)), lower(trim(input_title))) >= similarity_threshold
        )
    order by similarity_score desc
    limit 5;
end;
$$;

-- 5. Stored Procedure / RPC for binary SHA-256 duplicate detection
create or replace function public.check_duplicate_file_hash(
    input_file_hash text,
    exclude_file_id uuid default null
)
returns table (
    id uuid,
    title text,
    researcher text,
    category text,
    publication_year text,
    file_name text,
    file_size bigint,
    status text,
    created_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if input_file_hash is null or trim(input_file_hash) = '' then
        return;
    end if;

    return query
    select 
        rf.id,
        rf.title,
        rf.researcher,
        rf.category,
        rf.publication_year,
        rf.file_name,
        rf.file_size,
        rf.status,
        rf.created_at
    from public.research_files rf
    where 
        rf.file_hash = input_file_hash
        and (exclude_file_id is null or rf.id <> exclude_file_id)
    order by rf.created_at desc
    limit 5;
end;
$$;

-- Grant execution to authenticated users
revoke execute on function public.check_title_similarity(text, float, uuid) from public;
grant execute on function public.check_title_similarity(text, float, uuid) to authenticated;

revoke execute on function public.check_duplicate_file_hash(text, uuid) from public;
grant execute on function public.check_duplicate_file_hash(text, uuid) to authenticated;
