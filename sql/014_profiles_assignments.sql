-- 014: Team profiles + company assignments (Admin / Sales / Service)
-- Run in Supabase SQL editor once.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'sales'
    check (role in ('admin', 'sales', 'service')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_active_idx on public.profiles (active);

create table if not exists public.company_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  assigned_by uuid references public.profiles (id),
  assigned_at timestamptz not null default now(),
  unique (user_id, company_id)
);

create index if not exists company_assignments_user_idx on public.company_assignments (user_id);
create index if not exists company_assignments_company_idx on public.company_assignments (company_id);

alter table public.profiles enable row level security;
alter table public.company_assignments enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active
  ));

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active)
    or id = auth.uid()
  );

drop policy if exists assignments_select_authenticated on public.company_assignments;
create policy assignments_select_authenticated on public.company_assignments
  for select to authenticated using (true);

drop policy if exists assignments_write_admin on public.company_assignments;
create policy assignments_write_admin on public.company_assignments
  for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active)
  );

insert into public.profiles (id, email, full_name, role, active)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  'admin',
  true
from auth.users u
on conflict (id) do update set
  email = excluded.email,
  updated_at = now();

comment on table public.profiles is 'App roles: admin | sales | service';
comment on table public.company_assignments is 'Sales/Service users only access these companies';
