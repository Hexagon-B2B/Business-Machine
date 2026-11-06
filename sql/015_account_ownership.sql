-- 015: Account ownership (one owner + optional watchers) + transfer audit
-- Run AFTER 014_profiles_assignments.sql

alter table public.companies
  add column if not exists owner_id uuid references public.profiles (id) on delete set null;

create index if not exists companies_owner_id_idx on public.companies (owner_id);

create table if not exists public.company_watchers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id),
  added_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index if not exists company_watchers_user_idx on public.company_watchers (user_id);
create index if not exists company_watchers_company_idx on public.company_watchers (company_id);

alter table public.company_watchers enable row level security;

drop policy if exists watchers_select_authenticated on public.company_watchers;
create policy watchers_select_authenticated on public.company_watchers
  for select to authenticated using (true);

drop policy if exists watchers_write_admin_or_owner on public.company_watchers;
create policy watchers_write_admin_or_owner on public.company_watchers
  for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active)
    or exists (select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active)
    or exists (select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid())
  );

create table if not exists public.ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  from_owner_id uuid references public.profiles (id),
  to_owner_id uuid not null references public.profiles (id),
  transferred_by uuid not null references public.profiles (id),
  reason text,
  transferred_at timestamptz not null default now()
);

create index if not exists ownership_transfers_company_idx on public.ownership_transfers (company_id);

alter table public.ownership_transfers enable row level security;

drop policy if exists transfers_select_authenticated on public.ownership_transfers;
create policy transfers_select_authenticated on public.ownership_transfers
  for select to authenticated using (true);

drop policy if exists transfers_insert_admin on public.ownership_transfers;
create policy transfers_insert_admin on public.ownership_transfers
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active)
  );

alter table public.tasks add column if not exists created_by uuid references public.profiles (id);
alter table public.meetings_calls add column if not exists created_by uuid references public.profiles (id);
alter table public.opportunities add column if not exists created_by uuid references public.profiles (id);

update public.companies c
set owner_id = p.id
from public.profiles p
where c.owner_id is null
  and p.role = 'admin'
  and p.active = true
  and p.id = (
    select id from public.profiles
    where role = 'admin' and active = true
    order by created_at asc nulls last
    limit 1
  );

comment on column public.companies.owner_id is 'Account Owner — only owner creates tasks/meetings/opps';
comment on table public.ownership_transfers is 'Audit log of Account Owner changes';
