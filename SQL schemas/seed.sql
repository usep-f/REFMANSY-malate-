-- ================================================================
-- REFMANSY COMPLETE DATABASE SCHEMA & STORAGE SETUP
-- ================================================================

-- 1. Create Profiles Table (Linked to Supabase Auth)
create table if not exists public.profiles (
    id uuid references auth.users on delete cascade primary key,
    full_name text not null,
    username text unique not null,
    email text unique not null,
    role text not null default 'faculty' check (role in ('admin', 'faculty')),
    status text not null default 'active' check (status in ('active', 'inactive')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create Categories Table
create table if not exists public.categories (
    id uuid default gen_random_uuid() primary key,
    name text unique not null,
    description text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create Tags Table
create table if not exists public.tags (
    id uuid default gen_random_uuid() primary key,
    name text unique not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Create Research Files Table
create table if not exists public.research_files (
    id uuid default gen_random_uuid() primary key,
    title text not null,
    researcher text not null,
    co_researchers text,
    department text,
    research_type text,
    category text not null,
    publication_year text not null,
    description text,
    keywords text,
    file_path text,
    file_name text,
    file_size bigint,
    file_type text default 'application/pdf',
    owner_id uuid references public.profiles(id) on delete set null,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    review_comment text,
    reviewed_by uuid references public.profiles(id) on delete set null,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Create Download Records Table
create table if not exists public.download_records (
    id uuid default gen_random_uuid() primary key,
    file_id uuid references public.research_files(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete set null,
    file_title text,
    file_category text,
    user_name text,
    user_email text,
    downloaded_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Create Feedback Table
create table if not exists public.feedback (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) on delete set null,
    user_name text,
    user_email text,
    type text not null default 'general',
    subject text not null,
    message text not null,
    rating integer,
    status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
    admin_reply text,
    admin_id uuid references public.profiles(id) on delete set null,
    admin_name text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);


-- 7. Seed Default Categories
insert into public.categories (name, description) values
    ('Education', 'Pedagogy, instructional methods, and academic curricula'),
    ('Information Technology', 'Software systems, network architecture, and computing'),
    ('Engineering', 'Mechanical, civil, electrical, and applied engineering'),
    ('Business', 'Economics, management, marketing, and entrepreneurship'),
    ('Health', 'Medical research, healthcare systems, and nursing'),
    ('Social Science', 'Sociology, psychology, governance, and human behavior'),
    ('Agriculture', 'Agri-business, farming tech, and sustainability'),
    ('Environmental Science', 'Climate, ecology, and environmental preservation'),
    ('Other', 'Interdisciplinary and miscellaneous studies')
on conflict (name) do nothing;

-- 8. Automatic Profile Creation Trigger on Sign Up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, username, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'fullname', 'User'),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'faculty'),
    'active'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    username = excluded.username,
    role = excluded.role;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 9. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.research_files enable row level security;
alter table public.download_records enable row level security;
alter table public.feedback enable row level security;

-- Helper function to check admin role safely
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

-- Profiles: Authenticated users can read all profiles; users can update own profile; admins can update/delete
create policy "Allow read profiles" on public.profiles for select to authenticated using (true);
create policy "Allow insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Allow user update self" on public.profiles for update to authenticated 
using (auth.uid() = id)
with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and status = (select p.status from public.profiles p where p.id = auth.uid())
);
create policy "Allow admin update profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Allow admin delete profiles" on public.profiles for delete to authenticated using (public.is_admin());

-- Categories & Tags: Authenticated users can read; admins can insert/update/delete
create policy "Allow read categories" on public.categories for select to authenticated using (true);
create policy "Allow admin write categories" on public.categories for all to authenticated using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Allow read tags" on public.tags for select to authenticated using (true);
create policy "Allow admin write tags" on public.tags for all to authenticated using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Research Files: Faculty can view approved files and their own files; Admins can view all
create policy "Allow select research files" on public.research_files for select to authenticated using (
    status = 'approved' 
    or owner_id = auth.uid() 
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Allow faculty insert own research" on public.research_files for insert to authenticated with check (
    owner_id = auth.uid()
);

create policy "Allow faculty update own pending or rejected research" on public.research_files for update to authenticated 
using (
    (owner_id = auth.uid() and status in ('pending', 'rejected'))
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
)
with check (
    (owner_id = auth.uid() and status in ('pending', 'rejected'))
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Allow admin or owner delete" on public.research_files for delete to authenticated using (
    owner_id = auth.uid() 
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Download Records: Users can log downloads and see their own; Admins see all
create policy "Allow read download records" on public.download_records for select to authenticated using (
    user_id = auth.uid() 
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Allow insert download records" on public.download_records for insert to authenticated with check (
    user_id = auth.uid()
);

-- Feedback: Users can read/insert their own feedback; Admins can manage all
create policy "Allow read feedback" on public.feedback for select to authenticated using (
    user_id = auth.uid() 
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Allow insert feedback" on public.feedback for insert to authenticated with check (
    user_id = auth.uid()
);
create policy "Allow admin update feedback" on public.feedback for update to authenticated using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Allow admin delete feedback" on public.feedback for delete to authenticated using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- 10. Admin User Account Deletion Function (RPC)
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

