-- ================================================================
-- REFMANSY: Feedback System Migration & Fixes
-- Run this in your Supabase SQL Editor to update existing databases
-- ================================================================

-- 1. Add missing 'type' column to feedback table
alter table public.feedback 
    add column if not exists type text not null default 'general';

-- 2. Add optional admin tracking columns
alter table public.feedback 
    add column if not exists admin_id uuid references public.profiles(id) on delete set null;

alter table public.feedback 
    add column if not exists admin_name text;

-- 3. Ensure status check constraint allows 'new', 'in_progress', 'resolved'
-- (In case legacy data had 'in-progress' with hyphens)
update public.feedback 
set status = 'in_progress' 
where status = 'in-progress';

-- 4. Enable admin deletion policy on feedback if not already defined
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
